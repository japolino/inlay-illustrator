/*! Lightboard TOON Decode, Copyright (c) 2025-2026 amonamona. CC BY-NC-SA 4.0. */
// TypeScript adaptation of references/v453/core/6.txt. Keep the source grammar,
// including bare strings, marker indentation, implicit lists and length checks.
type ObjectValue = Record<string, unknown>;
type Line = { depth: number; content: string };
type Header = { key?: string; length: number; delimiter: string; fields?: string[] };
const object = (): ObjectValue => Object.create(null) as ObjectValue;

function unescape(text: string): string {
  return text.replace(/\\(u000[aA]|[\s\S])/g, (_, c: string) => {
    const values: Record<string, string> = { "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t", u000a: "\n", u000A: "\n" };
    if (!(c in values)) throw new Error(`Invalid escape sequence: \\${c}`);
    return values[c]!;
  });
}
function value(token: string): unknown {
  if (/^".*"$/.test(token)) return unescape(token.slice(1, -1));
  if (token === "null") return undefined;
  if (token === "true" || token === "false") return token === "true";
  if (/^0\d+$/.test(token)) return token;
  if (token.trim() && Number.isFinite(Number(token))) return Number(token);
  return token.includes("\\") ? unescape(token) : token;
}
function key(token: string): string {
  const parsed = value(token);
  if (parsed === undefined) throw new Error("Invalid key: null");
  return String(parsed);
}
function positions(text: string, delimiter: string): number[] {
  const found: number[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length && (quoted || text[i + 1] === '"' || text[i + 1] === "\\")) i++;
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === delimiter) found.push(i);
  }
  return found;
}
function split(text: string, delimiter: string): string[] {
  let start = 0;
  return [...positions(text, delimiter), text.length].map(end => {
    const part = text.slice(start, end); start = end + 1; return part;
  });
}
function header(text: string): Header | undefined {
  const match = /^(.*?)\[(\d+)([^\]]*)\]([:{].*)$/.exec(text);
  if (!match) return;
  const tail = match[4]!;
  const delimiter = match[3]![0] === "|" || match[3]![0] === "\t" ? match[3]![0]! : ",";
  const end = tail.startsWith("{") ? positions(tail.slice(1), "}")[0] : undefined;
  const fields = end !== undefined && end > 0 ? split(tail.slice(1, end + 1), delimiter).map(f => {
    const t = f.trim(); return /^".*"$/.test(t) ? unescape(t.slice(1, -1)) : t;
  }) : undefined;
  return { key: match[1] || undefined, length: Number(match[2]), delimiter, fields };
}
function checkLength(expected: number, actual: number): void {
  if (expected !== actual) throw new Error(`Array length mismatch: expected ${expected}, got ${actual}`);
}

export function decodeLightboardToon(text: string): unknown {
  if (!text.trim()) return object();
  const lines: Line[] = text.split("\n").filter(line => line !== "").map((line, index) => {
    const markers = /^⇥*/.exec(line)![0].length;
    const remainder = line.slice(markers);
    const spaces = /^ */.exec(remainder)![0].length;
    if (spaces % 2) throw new Error(`Line ${index + 1}: Indentation must be exact multiple of 2, but found ${spaces + markers * 2} spaces.`);
    return { depth: markers + spaces / 2, content: remainder.slice(spaces) };
  });
  const colon = (s: string) => positions(s, ":")[0];
  function tabular(index: number, depth: number, h: Header): [unknown[], number] {
    const result: unknown[] = [];
    while (index < lines.length && lines[index]!.depth >= depth) {
      const line = lines[index]!;
      let content = " ".repeat((line.depth - depth) * 2) + line.content;
      if (line.depth === depth) {
        if (content.startsWith("- ")) content = content.slice(2);
        if (!positions(content, h.delimiter).length && colon(content) !== undefined) break;
      }
      const tokens = split(content, h.delimiter), row = object();
      h.fields!.forEach((field, i) => { row[field] = value(tokens[i] ?? ""); });
      result.push(row); index++;
    }
    return [result, index];
  }
  function siblings(result: ObjectValue, index: number, depth: number, delimiter: string): number {
    while (index < lines.length && lines[index]!.depth === depth) {
      const content = lines[index]!.content, h = header(content), at = colon(content);
      if (h?.key) {
        const [arr, next] = decode(index, depth, delimiter, true);
        result[h.key] = arr; index = next;
      } else {
        if (at === undefined) break;
        const v = content.slice(at + 1).trim(), k = key(content.slice(0, at));
        if (v === "" && lines[index + 1] && lines[index + 1]!.depth > depth) {
          const [child, next] = decode(index + 1, depth + 1, delimiter);
          result[k] = child ?? object(); index = next;
        } else { result[k] = value(v); index++; }
      }
    }
    return index;
  }
  function list(index: number, depth: number, delimiter: string): [unknown[], number] {
    const result: unknown[] = [];
    while (index < lines.length && lines[index]!.depth === depth && lines[index]!.content.startsWith("- ")) {
      const [item, next] = decode(index, depth, delimiter); result.push(item); index = next;
    }
    return [result, index];
  }
  function listItem(index: number, depth: number, delimiter: string): [unknown, number] {
    const content = lines[index]!.content.slice(2), h = header(content), at = colon(content);
    if (!content) return [object(), index + 1];
    if (h && !h.key) {
      const tail = at === undefined ? "" : content.slice(at + 1).trimStart();
      const arr = tail ? split(tail, h.delimiter).map(value) : [];
      index++;
      while (index < lines.length && lines[index]!.depth === depth + 2) {
        const [item, next] = decode(index, depth + 2, h.delimiter); arr.push(item); index = next;
      }
      checkLength(h.length, arr.length); return [arr, index];
    }
    if (at === undefined) return [value(content), index + 1];
    const result = object(), v = content.slice(at + 1).trim(), k = key(content.slice(0, at));
    if (h?.key) {
      const initial = v ? split(v, h.delimiter).map(value) : [];
      const [arr, next] = h.fields ? tabular(index + 1, depth + 1, h) : list(index + 1, depth + 1, h.delimiter);
      initial.push(...arr); checkLength(h.length, initial.length); result[h.key] = initial; index = next;
    } else if (v === "" && lines[index + 1] && lines[index + 1]!.depth > depth + 1) {
      const [child, next] = decode(index + 1, depth + 2, delimiter); result[k] = child ?? object(); index = next;
    } else { result[k] = value(v); index++; }
    return [result, siblings(result, index, depth + 1, delimiter)];
  }
  function decode(index: number, depth: number, delimiter = ",", expectValue = false): [unknown, number] {
    const line = lines[index];
    if (!line || line.depth !== depth) return [undefined, index];
    const content = line.content, h = header(content), at = colon(content);
    if (content.startsWith("- ")) return listItem(index, depth, delimiter);
    if (h) {
      if (h.key && !expectValue) {
        const obj = object(); return [obj, siblings(obj, index, depth, delimiter)];
      }
      const tail = at === undefined ? "" : content.slice(at + 1).trim();
      if (tail) { const arr = split(tail, h.delimiter).map(value); checkLength(h.length, arr.length); return [arr, index + 1]; }
      if (h.fields) { const [arr, next] = tabular(index + 1, depth + 1, h); checkLength(h.length, arr.length); return [arr, next]; }
      index++;
      let arr: unknown[] = [];
      if (lines[index]?.depth === depth + 1 && lines[index]!.content.startsWith("- ")) [arr, index] = list(index, depth + 1, h.delimiter);
      else while (index < lines.length && lines[index]!.depth >= depth + 1) {
        const row = lines[index++]!; arr.push(value(" ".repeat((row.depth - depth - 1) * 2) + row.content));
      }
      checkLength(h.length, arr.length); return [arr, index];
    }
    if (at === undefined) return [value(content), index + 1];
    const obj = object(), k = key(content.slice(0, at)), v = content.slice(at + 1).trim();
    if (v === "" && lines[index + 1] && lines[index + 1]!.depth > depth) {
      const [child, next] = lines[index + 1]!.depth === depth + 1 && lines[index + 1]!.content.startsWith("- ")
        ? list(index + 1, depth + 1, delimiter) : decode(index + 1, depth + 1, delimiter);
      obj[k] = child ?? object(); index = next;
    } else { obj[k] = value(v); index++; }
    return [obj, siblings(obj, index, depth, delimiter)];
  }
  const first = lines[0]!;
  if (first.depth === 0) {
    const h = header(first.content), at = colon(first.content);
    if (h && !h.key) return decode(0, 0)[0];
    if (lines.length === 1 && !h) {
      if (at === undefined) return value(first.content);
      if (!first.content.slice(at + 1).trim()) { const obj = object(); obj[key(first.content.slice(0, at))] = object(); return obj; }
    }
  }
  const result = object();
  let index = 0;
  while (index < lines.length && lines[index]!.depth === 0) {
    const content = lines[index]!.content, h = header(content), at = colon(content);
    if (h?.key) { const [arr, next] = decode(index, 0, ",", true); result[h.key] = arr; index = next; }
    else {
      if (at === undefined) throw new Error(`Invalid syntax: ${content}`);
      const k = key(content.slice(0, at)), v = content.slice(at + 1).trim();
      if (v === "" && lines[index + 1] && lines[index + 1]!.depth >= 1) {
        const [child, next] = lines[index + 1]!.depth === 1 && lines[index + 1]!.content.startsWith("- ") ? list(index + 1, 1, ",") : decode(index + 1, 1);
        result[k] = child ?? object(); index = next;
      } else { result[k] = value(v); index++; }
    }
  }
  return result;
}
