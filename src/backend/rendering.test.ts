import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { imageUrlFromId, renderInlaidMessage } from "./rendering.js";

describe("inlay rendering", () => {
  test("places images before their target paragraphs and preserves image order within a paragraph", () => {
    const rendered = renderInlaidMessage(
      "First paragraph.\n\nSecond paragraph.",
      {
        imageUrls: ["/second-a.png", "/first.png", "/second-b.png"],
        prompts: ["second A", "first", "second B"],
        paragraphs: [2, 1, 2]
      },
      DEFAULT_CONFIG
    );

    const firstImage = rendered.indexOf('alt="Inlay 2"');
    const firstParagraph = rendered.indexOf("First paragraph.");
    const secondImageA = rendered.indexOf('alt="Inlay 1"');
    const secondImageB = rendered.indexOf('alt="Inlay 3"');
    const secondParagraph = rendered.indexOf("Second paragraph.");

    expect(firstImage).toBeGreaterThanOrEqual(0);
    expect(firstImage).toBeLessThan(firstParagraph);
    expect(firstParagraph).toBeLessThan(secondImageA);
    expect(secondImageA).toBeLessThan(secondImageB);
    expect(secondImageB).toBeLessThan(secondParagraph);
    expect(rendered.split(MARKER)).toHaveLength(4);
  });

  test("clamps invalid paragraph targets and applies mode-specific dimensions", () => {
    const rendered = renderInlaidMessage(
      "First.\n\nSecond.",
      {
        imageUrls: ["/too-low.png", "/too-high.png"],
        prompts: ["low", "high"],
        paragraphs: [0, 99]
      },
      {
        ...DEFAULT_CONFIG,
        mode: "asset",
        assetImageWidth: 812,
        inlayImageMaxHeightVh: 63
      }
    );

    expect(rendered.indexOf("/too-low.png")).toBeLessThan(rendered.indexOf("First."));
    expect(rendered.indexOf("First.")).toBeLessThan(rendered.indexOf("/too-high.png"));
    expect(rendered.indexOf("/too-high.png")).toBeLessThan(rendered.indexOf("Second."));
    expect(rendered).toContain("width:min(100%, 812px)");
    expect(rendered).toContain("max-height:63vh");
  });

  test("escapes URL and prompt HTML and neutralizes prompt code fences", () => {
    const rendered = renderInlaidMessage(
      "Paragraph.",
      {
        imageUrls: ['/image?name="quoted"&tag=<unsafe>'],
        prompts: ['look "here" & <script>alert(1)</script> ```danger```'],
        paragraphs: [1]
      },
      DEFAULT_CONFIG
    );

    expect(rendered).toContain('src="/image?name=&quot;quoted&quot;&amp;tag=&lt;unsafe&gt;"');
    expect(rendered).toContain("look &quot;here&quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt; '''danger'''");
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("```");
  });

  test("keeps multiline prompts inside one raw HTML block for image and lightbox rendering", () => {
    const rendered = renderInlaidMessage(
      "Paragraph.",
      {
        imageUrls: ["/multiline.png"],
        prompts: ["quality tags,\n\n1girl,\n\nThe girl turns toward the viewer."],
        paragraphs: [1]
      },
      DEFAULT_CONFIG
    );
    const blockStart = rendered.indexOf('<div class="inlay-illustrator-image"');
    const blockEnd = rendered.indexOf("</div>", blockStart) + "</div>".length;
    const block = rendered.slice(blockStart, blockEnd);

    expect(block.split("\n")).toHaveLength(1);
    expect(block).toContain("quality tags,&#10;&#10;1girl,&#10;&#10;The girl turns toward the viewer.");
    expect(block).toContain("data-lightbox");
    expect(block).toContain("data-inlay-illustrator-prompt=");
    expect(block).toContain('<pre class="inlay-illustrator-prompt" hidden>');
  });

  test("encodes provider image IDs for the Lumiverse result route", () => {
    expect(imageUrlFromId("folder/id ?#value")).toBe("/api/v1/image-gen/results/folder%2Fid%20%3F%23value");
  });

  test("replaces existing Inlay blocks instead of duplicating them", () => {
    const original = "First paragraph.\n\nSecond paragraph.";
    const record = {
      imageUrls: ["/first.png", "/second.png"],
      prompts: ["first prompt", "second prompt"],
      paragraphs: [1, 2]
    };

    const rendered = renderInlaidMessage(original, record, DEFAULT_CONFIG);
    const rerendered = renderInlaidMessage(rendered, record, DEFAULT_CONFIG);

    expect(rerendered).toBe(rendered);
    expect(rerendered.split(MARKER)).toHaveLength(3);
  });
});
