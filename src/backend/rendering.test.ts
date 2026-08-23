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

  test("places cover images above all prose regardless of image-array order", () => {
    const original = "First paragraph.\n\nSecond paragraph.";
    const record = {
      imageUrls: ["/paragraph.png", "/cover.png"],
      prompts: ["paragraph", "cover"],
      placements: ["paragraph", "cover"] as Array<"cover" | "paragraph">,
      paragraphs: [2, 1]
    };
    const rendered = renderInlaidMessage(original, record, DEFAULT_CONFIG);

    expect(rendered.indexOf("/cover.png")).toBeLessThan(rendered.indexOf("First paragraph."));
    expect(rendered.indexOf("First paragraph.")).toBeLessThan(rendered.indexOf("/paragraph.png"));
    expect(rendered.indexOf("/paragraph.png")).toBeLessThan(rendered.indexOf("Second paragraph."));
    expect(rendered).toContain('alt="Cover image"');
    expect(rendered.split(MARKER)).toHaveLength(3);
    expect(renderInlaidMessage(rendered, record, DEFAULT_CONFIG)).toBe(rendered);
  });

  test("applies dedicated cover display size while paragraph inlays keep their own size", () => {
    const config = {
      ...DEFAULT_CONFIG,
      inlayImageWidth: 640,
      inlayImageMaxHeightVh: 70,
      coverImageWidth: 1500,
      coverImageMaxHeightVh: 45
    };
    const rendered = renderInlaidMessage("First.\n\nSecond.", {
      imageUrls: ["/cover.png", "/first.png"],
      prompts: ["cover", "first"],
      placements: ["cover", "paragraph"] as Array<"cover" | "paragraph">,
      paragraphs: [1, 1]
    }, config);
    const coverImage = rendered.indexOf("/cover.png");
    const paragraphImage = rendered.indexOf("/first.png");
    const coverBlock = rendered.slice(rendered.lastIndexOf('<div class="inlay-illustrator-image"', coverImage), rendered.indexOf("</div>", coverImage));
    const paragraphBlock = rendered.slice(rendered.lastIndexOf('<div class="inlay-illustrator-image"', paragraphImage), rendered.indexOf("</div>", paragraphImage));
    expect(coverBlock).toContain("width:min(100%, 1500px)");
    expect(coverBlock).toContain("max-height:45vh");
    expect(paragraphBlock).toContain("width:min(100%, 640px)");
    expect(paragraphBlock).toContain("max-height:70vh");
  });

  test("clamps invalid paragraph targets and applies configured dimensions", () => {
    const rendered = renderInlaidMessage(
      "First.\n\nSecond.",
      {
        imageUrls: ["/too-low.png", "/too-high.png"],
        prompts: ["low", "high"],
        paragraphs: [0, 99]
      },
      {
        ...DEFAULT_CONFIG,
        inlayImageWidth: 812,
        inlayImageMaxHeightVh: 63
      }
    );

    expect(rendered.indexOf("/too-low.png")).toBeLessThan(rendered.indexOf("First."));
    expect(rendered.indexOf("First.")).toBeLessThan(rendered.indexOf("/too-high.png"));
    expect(rendered.indexOf("/too-high.png")).toBeLessThan(rendered.indexOf("Second."));
    expect(rendered).toContain("width:min(100%, 812px)");
    expect(rendered).toContain("max-height:63vh");
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

    expect(rendered).toContain('src="/image?name=&quot;quoted&quot;&amp;tag=&lt;unsafe&gt;"');
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
        perspectiveModes: ["creative"],
        perspectiveSources: ["adaptive"],
        creativeConcepts: [creativeConcept],
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

  test("uses the compact Asset width only for records generated in Asset Mode", () => {
    const config = { ...DEFAULT_CONFIG, inlayImageWidth: 800, assetImageWidth: 420 };
    const asset = renderInlaidMessage("Paragraph.", {
      imageUrls: ["/asset.png"],
      prompts: ["asset"],
      perspectiveModes: ["asset"],
      paragraphs: [1]
    }, config);
    const adaptiveIllustration = renderInlaidMessage("Paragraph.", {
      imageUrls: ["/dynamic.png"],
      prompts: ["dynamic"],
      perspectiveModes: ["dynamic"],
      perspectiveSources: ["adaptive"],
      paragraphs: [1]
    }, { ...config, adaptiveMode: true, perspectiveMode: "asset" });

    expect(asset).toContain("width:min(100%, 420px)");
    expect(adaptiveIllustration).toContain("width:min(100%, 800px)");
  });

  test("renders stable progressive slots in paragraph order and replaces placeholders in place", () => {
    const pending = renderInlaidMessage("First.\n\nSecond.", {
      imageUrls: ["", ""],
      prompts: ["first", "second"],
      paragraphs: [1, 2],
      slotStatuses: ["pending", "pending"]
    }, DEFAULT_CONFIG);
    expect(pending).toContain("Generating illustration 1");
    expect(pending).toContain("Generating illustration 2");
    expect(pending.indexOf("Generating illustration 1")).toBeLessThan(pending.indexOf("First."));
    expect(pending.indexOf("Generating illustration 2")).toBeLessThan(pending.indexOf("Second."));

    const progressive = renderInlaidMessage(pending, {
      imageUrls: ["", "/second.png"],
      prompts: ["first", "second"],
      paragraphs: [1, 2],
      slotStatuses: ["failed", "completed"]
    }, DEFAULT_CONFIG);
    expect(progressive).not.toContain("Generating illustration");
    expect(progressive).toContain("Illustration 1 failed");
    expect(progressive).toContain("/second.png");
    expect(progressive.split(MARKER)).toHaveLength(3);
  });
  test("reserves the same frame geometry before and after a progressive image loads", () => {
    const config = {
      ...DEFAULT_CONFIG,
      imageParameters: { width: 768, height: 1024 },
      inlayImageWidth: 640,
      inlayImageMaxHeightVh: 70
    };
    const baseSlot = {
      prompt: "scene",
      perspectiveMode: "dynamic" as const,
      imageParameters: { width: 768, height: 1024 },
      placement: "paragraph" as const,
      paragraph: 1
    };
    const pending = renderInlaidMessage("Paragraph.", {
      slots: [{ ...baseSlot, status: "pending" }]
    }, config);
    const completed = renderInlaidMessage("Paragraph.", {
      slots: [{ ...baseSlot, imageUrl: "/ready.png", status: "completed" }]
    }, config);
    const expectedFrame = "width:min(100%, 640px);aspect-ratio:768 / 1024;max-height:70vh";

    expect(pending).toContain(expectedFrame);
    expect(completed).toContain(expectedFrame);
    expect(completed).toContain('width="768" height="1024"');
    expect(completed).toContain("width:100%;height:100%;object-fit:contain");
  });

  test("renders canonical V3 slots without reconstructing parallel arrays", () => {
    const rendered = renderInlaidMessage("First.\n\nSecond.", {
      slots: [
        { imageUrl: "/cover-v3.png", placement: "cover", paragraph: 1, status: "completed" },
        { imageUrl: "/second-v3.png", placement: "paragraph", paragraph: 2, status: "completed", perspectiveMode: "dynamic" }
      ]
    }, DEFAULT_CONFIG);

    expect(rendered.indexOf("/cover-v3.png")).toBeLessThan(rendered.indexOf("First."));
    expect(rendered.indexOf("/second-v3.png")).toBeLessThan(rendered.indexOf("Second."));
  });

});
