/**
 * Drawing a picture into the setting of another (shared pictures with a `base`, shared-pictures.ts): a NovelAI infill
 * on the base image. The mask repaints all of it but a 64 px frame on the top, left and right, and the kept frame
 * (the place, its light and palette) is pasted back over the result (`add_original_image`), so the people and what
 * they do change while the place stays.
 *
 * The frame, from test runs on Gambit's adult-scene pictures (1216x832, the people filling most of the frame):
 * - A wider frame (104-128 px) holds parts of the first picture's people (ears at the top, a tail at the side) and
 *   pins the next one to the same pose.
 * - A frame along the bottom keeps the first picture's point-of-view body there, whatever the new pose is.
 * - A feathered edge leaves a grey seam where the mask is grey; a hard one on the 8 px latent grid leaves none.
 *
 * The request (Lumiverse's NovelAI provider, through `rawRequestOverride`): action "infill", `parameters.image` and
 * `parameters.mask` as base64 PNGs (white is repainted), the inpainting model (`<model>-inpainting`) as the host
 * model, the canvas the base's size.
 */
import type { ImageBytes } from "../services/types.js";
import { base64ToBytes, bytesToBase64 } from "./providers.js";

export const INFILL_FRAME = 64;

export interface Infill {
  /** The base image, base64 PNG. */
  image: string;
  /** White where the picture is repainted, base64 PNG. */
  mask: string;
  model: string;
  width: number;
  height: number;
}

/** NovelAI's inpainting model for a model (V5 Medium has none of its own: Full's). */
export function inpaintingModel(model: string): string {
  const base = model.replace(/-medium$/u, "");
  return base.endsWith("-inpainting") ? base : `${base}-inpainting`;
}

/** Width and height from a PNG's header, or null when it is not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The infill mask of a base of this size: a greyscale PNG, white but for the kept frame. */
export async function infillMask(width: number, height: number, frame = INFILL_FRAME): Promise<Uint8Array> {
  const row = width + 1;
  const raw = new Uint8Array(row * height);
  for (let y = frame; y < height; y += 1) raw.fill(255, y * row + 1 + frame, y * row + 1 + width - frame);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The infill of a picture on this base, or null when the base is not a PNG. */
export async function infillOn(base: ImageBytes, model: string): Promise<Infill | null> {
  const image = base.data.replace(/^data:[^;,]+;base64,/u, "");
  const size = pngSize(base64ToBytes(image.slice(0, 32)));
  if (!size) return null;
  return { image, mask: bytesToBase64(await infillMask(size.width, size.height)), model: inpaintingModel(model), ...size };
}
