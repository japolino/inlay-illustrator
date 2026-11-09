import { describe, expect, test } from "bun:test";
import { bytesToBase64 } from "./providers.js";
import { INFILL_FRAME, infillMask, infillOn, inpaintingModel, pngSize } from "./scene-infill.js";

async function greyPixels(png: Uint8Array): Promise<{ width: number; height: number; at: (x: number, y: number) => number }> {
  const size = pngSize(png)!;
  const idat = png.subarray(8 + 25 + 8, png.length - 12 - 4);
  const raw = new Uint8Array(await new Response(new Blob([idat as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  return { ...size, at: (x, y) => raw[y * (size.width + 1) + 1 + x]! };
}

describe("scene infill", () => {
  test("the mask repaints all but a frame on the top, left and right", async () => {
    const mask = await greyPixels(await infillMask(1216, 832));
    expect([mask.width, mask.height]).toEqual([1216, 832]);
    expect(mask.at(608, 400)).toBe(255);
    expect(mask.at(608, 831)).toBe(255);
    expect(mask.at(INFILL_FRAME, INFILL_FRAME)).toBe(255);
    expect(mask.at(608, INFILL_FRAME - 1)).toBe(0);
    expect(mask.at(INFILL_FRAME - 1, 831)).toBe(0);
    expect(mask.at(1216 - INFILL_FRAME, 400)).toBe(0);
  });

  test("an infill takes the base's size and the model's inpainting model; a base that isn't a PNG has none", async () => {
    const header = new Uint8Array(32);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0xc0, 0, 0, 3, 0x40]);
    const got = await infillOn({ data: `data:image/png;base64,${bytesToBase64(header)}`, mimeType: "image/png" }, "nai-diffusion-5-full");
    expect(got && { model: got.model, width: got.width, height: got.height, image: got.image }).toEqual({ model: "nai-diffusion-5-full-inpainting", width: 1216, height: 832, image: bytesToBase64(header) });
    expect(await infillOn({ data: bytesToBase64(new Uint8Array(32)), mimeType: "image/webp" }, "nai-diffusion-5-full")).toBeNull();
    expect(inpaintingModel("nai-diffusion-5-full-medium")).toBe("nai-diffusion-5-full-inpainting");
  });
});
