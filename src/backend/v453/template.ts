/*! Lightboard 4.5.3 adaptation. Copyright (c) 2026 amonamona. CC BY-NC-SA 4.0. See references/v453/README.md and THIRD_PARTY_NOTICES.md. */
/** Evaluates the balanced Risu macros used in the 4.5.3 instruction books. */
export function renderLightboardTemplate(source: string, values: Record<string, string>): string {
  const tagAt = (text: string, start: number): { inner: string; end: number } => {
    let depth = 1, end = start + 2;
    while (end < text.length && depth) {
      if (text.slice(end, end + 2) === "{{") { depth++; end += 2; }
      else if (text.slice(end, end + 2) === "}}") { depth--; end += 2; }
      else end++;
    }
    if (depth) throw new Error("Unclosed Lightboard template macro.");
    return { inner: text.slice(start + 2, end - 2).trim(), end };
  };
  const truth = (s: string) => s !== "" && s !== "0" && s !== "false" && s !== "null";
  const evalTag = (inner: string): string => {
    const text = render(inner).trim();
    const parts = text.split("::");
    const op = parts.shift()!;
    const arg = parts.join("::").trim();
    if (op === "getglobalvar" || op === "getvar") return values[arg.replace(/^toggle_/, "")] ?? "null";
    if (op === "trim") return arg.trim();
    if (op === "length") return String(arg.length);
    if (op === "and") return parts.every(p => truth(p.trim())) ? "1" : "0";
    if (op.startsWith("?")) {
      const expression = text.slice(1).trim();
      const m = /^(.*?)\s*(>=|<=|!=|==|>|<)\s*(.*?)$/.exec(expression);
      if (!m) return truth(expression) ? "1" : "0";
      const a = m[1]!.trim(), b = m[3]!.trim();
      const result = m[2] === "!=" ? a !== b : m[2] === "==" ? a === b :
        m[2] === ">" ? Number(a) > Number(b) : m[2] === "<" ? Number(a) < Number(b) :
        m[2] === ">=" ? Number(a) >= Number(b) : Number(a) <= Number(b);
      return result ? "1" : "0";
    }
    if (text === "user" || text === "char") return values[text] ?? text;
    throw new Error(`Unsupported Lightboard macro: ${text}`);
  };
  const condition = (inner: string): boolean => {
    const expr = inner.replace(/^#when(?:::|\s+)/, "").replace(/^keep::/, "");
    const resolved = render(expr).trim();
    const p = resolved.split("::");
    if (p[0] === "toggle") return truth(values[p[1]!] ?? "0");
    if (["tis", "tisnot", "vis", "visnot"].includes(p[1]!)) {
      const same = (values[p[0]!] ?? "null") === p.slice(2).join("::");
      return p[1]!.endsWith("not") ? !same : same;
    }
    return truth(resolved);
  };
  function render(text: string): string {
    let out = "", pos = 0;
    while (pos < text.length) {
      const start = text.indexOf("{{", pos);
      if (start < 0) return out + text.slice(pos);
      out += text.slice(pos, start);
      const tag = tagAt(text, start); pos = tag.end;
      if (tag.inner.startsWith("#when")) {
        let level = 1, cursor = pos, otherwise = -1, otherwiseEnd = -1, closing = -1;
        while (level) {
          const next = text.indexOf("{{", cursor);
          if (next < 0) throw new Error("Unclosed Lightboard conditional.");
          const sub = tagAt(text, next); cursor = sub.end;
          if (sub.inner.startsWith("#when")) level++;
          else if (sub.inner.startsWith("/")) { level--; if (!level) closing = next; }
          else if (sub.inner === ":else" && level === 1) { otherwise = next; otherwiseEnd = sub.end; }
        }
        out += condition(tag.inner) ? render(text.slice(pos, otherwise < 0 ? closing : otherwise))
          : otherwise < 0 ? "" : render(text.slice(otherwiseEnd, closing));
        pos = cursor;
      } else out += evalTag(tag.inner);
    }
    return out;
  }
  return render(source);
}
