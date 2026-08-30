import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { imageUrlFromId, renderInlaidMessage } from "./rendering.js";

const creativeConcept = {
  id: "creative-eye-gap",
  paragraph: 1,
  anchor: "Eye gap",
  concept: "one red eye framed between two fingers",
  renderScope: "one eye visible through a narrow finger gap",
  camera: "extreme close-up",
  visibleCues: ["red eye", "fingers"],
  score: 92
};

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

  test("drops invalid paragraph targets and applies configured dimensions to valid images", () => {
    const rendered = renderInlaidMessage(
      "First.\n\nSecond.",
      {
        imageUrls: ["/too-low.png", "/too-high.png", "/valid.png"],
        prompts: ["low", "high", "valid"],
        paragraphs: [0, 99, 2]
      },
      {
        ...DEFAULT_CONFIG,
        inlayImageWidth: 812,
        inlayImageMaxHeightVh: 63
      }
    );

    expect(rendered).not.toContain("/too-low.png");
    expect(rendered).not.toContain("/too-high.png");
    expect(rendered).toContain("/valid.png");
    expect(rendered.indexOf("/valid.png")).toBeLessThan(rendered.indexOf("Second."));
    expect(rendered).toContain("width:min(100%, 812px)");
    expect(rendered).toContain("height:63vh");
    expect(rendered).toContain("object-fit:cover");
  });

  test("escapes image metadata without embedding prompt text in the chat", () => {
    const rendered = renderInlaidMessage(
      "Paragraph.",
      {
        imageUrls: ['/image?name="quoted"&tag=<unsafe>'],
        prompts: ['look "here" & <script>alert(1)</script> ```danger```'],
        paragraphs: [1]
      },
      DEFAULT_CONFIG
    );

    // The image URL is carried in a data attribute (no `<img src>`), so a
    // character card's asset display regex that rewrites `<img src="...">`
    // cannot mangle it. The URL is still HTML-attribute-escaped.
    expect(rendered).toContain('data-inlay-illustrator-image-url="/image?name=&quot;quoted&quot;&amp;tag=&lt;unsafe&gt;"');
    expect(rendered).not.toContain("<img src=");
    expect(rendered).not.toContain("look &quot;here&quot;");
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("```");
  });

  test("keeps a compact one-line image block and stores only lookup metadata", () => {
    const rendered = renderInlaidMessage(
      "Paragraph.",
      {
        chatId: "chat-1",
        messageId: "message-1",
        swipeId: 2,
        imageIds: ["image-1"],
        imageUrls: ["/multiline.png"],
        prompts: ["quality tags,\n\n1girl,\n\nThe girl turns toward the viewer."],
        negativePrompts: ["lowres, bad anatomy"],
        paragraphs: [1]
      },
      DEFAULT_CONFIG
    );
    const blockStart = rendered.indexOf('<div class="inlay-illustrator-image"');
    const blockEnd = rendered.indexOf("</div>", blockStart) + "</div>".length;
    const block = rendered.slice(blockStart, blockEnd);

    expect(block.split("\n")).toHaveLength(1);
    expect(block).not.toContain("quality tags");
    expect(block).not.toContain("data-lightbox");
    expect(block).not.toContain("data-inlay-illustrator-prompt=");
    expect(block).not.toContain("data-inlay-illustrator-negative-prompt=");
    expect(block).not.toContain("data-inlay-illustrator-perspective=");
    expect(block).toContain('data-inlay-illustrator-image-id="image-1"');
    expect(block).toContain('data-inlay-illustrator-chat-id="chat-1"');
    expect(block).toContain('data-inlay-illustrator-message-id="message-1"');
    expect(block).toContain('data-inlay-illustrator-swipe-id="2"');
    expect(block).toContain('data-inlay-illustrator-image-index="0"');
    expect(block).not.toContain('<pre class="inlay-illustrator-prompt"');
    expect(block).not.toContain('<pre class="inlay-illustrator-negative-prompt"');
  });

  test("renders an escaped quote below the image and uses the Asset Mode width", () => {
    const rendered = renderInlaidMessage("Paragraph.", {
      imageUrls: ["/asset.png"],
      prompts: ["1girl"],
      quotes: ['"Stay <close>."'],
      paragraphs: [1]
    }, { ...DEFAULT_CONFIG, mode: "asset", assetImageWidth: 512 });

    expect(rendered).toContain("inlay-illustrator-inline-quote");
    expect(rendered).toContain("&quot;Stay &lt;close&gt;.&quot;");
    expect(rendered).toContain("width:min(100%, 512px)");
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
