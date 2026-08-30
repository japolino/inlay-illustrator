/**
 * Faithful port of RisuAI Inlay v3.5 encoding / placeholder logic.
 * Source: references/original-module/original_script.txt lines 13-244, 496-4200
 * Spindle adaptation: none — pure string transforms, no platform dependency.
 *
 * Unicode note: Lua strings are byte strings (UTF-8 bytes). JS strings are
 * UTF-16. To emulate Lua byte-string behavior, we convert to UTF-8 bytes
 * via TextEncoder/TextDecoder before Base64. This is tested with non-ASCII
 * goldens (e.g., "café — résumé").
 */
const b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(str: string): string {
  if (!str) return "";
  const bytes = new TextEncoder().encode(str);
  const pad = bytes.length % 3;
  // Pad with zeros to multiple of 3 for loop, replicating Lua's rep('\0', 3-pad)
  const paddedLength = pad === 0 ? bytes.length : bytes.length + (3 - pad);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  const out: string[] = [];
  for (let i = 0; i < padded.length; i += 3) {
    const b1 = padded[i];
    const b2 = padded[i + 1];
    const b3 = padded[i + 2];
    const n = b1 * 65536 + b2 * 256 + b3;
    out.push(b64chars[Math.floor(n / 262144) % 64]);
    out.push(b64chars[Math.floor(n / 4096) % 64]);
    out.push(b64chars[Math.floor(n / 64) % 64]);
    out.push(b64chars[n % 64]);
  }
  let encoded = out.join("");
  if (pad === 1) encoded = encoded.slice(0, -2) + "==";
  else if (pad === 2) encoded = encoded.slice(0, -1) + "=";
  return encoded;
}

export function base64Decode(str: string): string {
  if (!str) return "";
  const compact = str.replace(/\s+/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const lookup: Record<string, number> = {};
  for (let i = 0; i < b64chars.length; i++) lookup[b64chars[i]] = i;
  const bytes: number[] = [];
  for (let i = 0; i < compact.length; i += 4) {
    const c1 = lookup[compact[i]] ?? 0;
    const c2 = lookup[compact[i + 1]] ?? 0;
    const c3 = lookup[compact[i + 2]] ?? 0;
    const c4 = lookup[compact[i + 3]] ?? 0;
    const n = c1 * 262144 + c2 * 4096 + c3 * 64 + c4;
    bytes.push(Math.floor(n / 65536) % 256);
    if (compact[i + 2] !== "=") bytes.push(Math.floor(n / 256) % 256);
    if (compact[i + 3] !== "=") bytes.push(n % 256);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function atbashCipher(str: string): string {
  if (!str) return "";
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const b = str.charCodeAt(i);
    if (b >= 65 && b <= 90) out += String.fromCharCode(155 - b);
    else if (b >= 97 && b <= 122) out += String.fromCharCode(219 - b);
    else out += str[i];
  }
  return out;
}

export const PLACEHOLDER_MAP: Record<string, string> = {
  BP1: "nipples",
  BP2: "areola",
  BP3: "pussy",
  BP4: "penis",
  BP5: "anus",
  BP6: "testicles",
  BP7: "clitoris",
  BP8: "pubic hair",
  BP9: "urethra",
  BP10: "foreskin",
  SE1: "nsfw",
  SE2: "uncensored",
  SE3: "topless",
  SE4: "bottomless",
  SE5: "nude",
  SE6: "sex",
  SE7: "penetration",
  SE8: "cum",
  SE9: "fellatio",
  SE10: "cunnilingus",
  SE11: "handjob",
  SE12: "paizuri",
  SE13: "anal",
  SE14: "masturbation",
  SE15: "orgasm",
  SE16: "ejaculation",
  SE17: "erection",
  SE18: "groping",
  SE19: "fingering",
  SE20: "vaginal",
};

export const PLACEHOLDER_KEYS: string[] = Object.keys(PLACEHOLDER_MAP).sort((a, b) => b.length - a.length);

export function decodePlaceholders(prompt: string | null | undefined): string {
  if (!prompt) return (prompt as string) ?? "";
  let out = prompt;
  for (const code of PLACEHOLDER_KEYS) {
    out = out.split(code).join(PLACEHOLDER_MAP[code]);
  }
  return out;
}

export type EncodeMethod = "0" | "1" | "2" | "3";

export function encodePrompt(str: string | null | undefined, method: EncodeMethod): string {
  if (!str) return "";
  let s = str;
  if (method !== "0") s = decodePlaceholders(s);
  if (method === "2") return atbashCipher(s);
  if (method === "1") return base64Encode(s);
  return s;
}

export function looksLikeCardPayloadText(str: string): boolean {
  if (!str) return false;
  return (
    /"scenes"\s*:/.test(str) ||
    /"shots"\s*:/.test(str) ||
    /"paragraph"\s*:/.test(str) ||
    /"camera"\s*:/.test(str) ||
    /"characters"\s*:/.test(str) ||
    /"positive"\s*:/.test(str) ||
    /"scene"\s*:/.test(str) ||
    /"action"\s*:/.test(str)
  );
}

export function hasClearlyInvalidTextBytes(str: string): boolean {
  if (!str) return true;
  let invalid = 0;
  for (let i = 0; i < str.length; i++) {
    const b = str.charCodeAt(i);
    if (b === 0) invalid += 3;
    else if (!(b === 9 || b === 10 || b === 13 || b >= 32)) invalid += 1;
    if (invalid >= 8) return true;
  }
  return false;
}

export function tryDecodeBase64Text(str: string): string | null {
  if (!str) return null;
  let compact = str.replace(/\s+/g, "");
  if (!compact || /[^A-Za-z0-9+/=]/.test(compact)) return null;
  const remainder = compact.length % 4;
  if (remainder === 1) return null;
  if (remainder > 0) compact += "=".repeat(4 - remainder);
  const decoded = base64Decode(compact);
  if (looksLikeCardPayloadText(decoded)) return decoded;
  if (hasClearlyInvalidTextBytes(decoded)) return null;
  return decoded;
}

export function isBase64OnlyLine(line: string): boolean {
  const trimmed = (line ?? "").trim();
  return trimmed !== "" && /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

export function looksLikeStructuredToon(line: string): boolean {
  return (
    line.includes('"scenes"') ||
    line.includes('"paragraph"') ||
    line.includes('"camera"') ||
    line.includes('"characters"') ||
    line.includes('"positive"') ||
    line.includes('"scene"') ||
    line.includes('"action"') ||
    line.includes("{") ||
    line.includes("}") ||
    line.includes("[") ||
    line.includes("]")
  );
}

export function decodeBase64Response(str: string): string {
  const raw = str ?? "";
  if (raw === "") return "";
  const lines = (raw + "\n").split("\n").slice(0, -1);
  const prefixLines: string[] = [];
  const suffixLines: string[] = [];
  let sawStructured = false;
  for (const line of lines) {
    if (!sawStructured && isBase64OnlyLine(line)) {
      prefixLines.push(line.trim());
    } else {
      sawStructured = sawStructured || looksLikeStructuredToon(line);
      suffixLines.push(line);
    }
  }
  if (sawStructured) {
    if (prefixLines.length > 0) {
      const decodedPrefix = tryDecodeBase64Text(prefixLines.join(""));
      if (decodedPrefix) return decodedPrefix + "\n" + suffixLines.join("\n");
    }
    return raw;
  }
  const decoded = tryDecodeBase64Text(raw);
  return decoded ?? raw;
}

export function decodeResponse(str: string, method: EncodeMethod): string {
  if (method === "2") return atbashCipher(str);
  if (method === "1") return decodeBase64Response(str);
  return str;
}
