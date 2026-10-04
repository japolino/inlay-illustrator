export const CLEANUP_KEY = "__inlayIllustratorCleanup";

export const DRAWER_TAB_OPTIONS = {
  id: "inlay_illustrator",
  title: "Inlay Illustrator",
  shortName: "Inlay",
  headerTitle: "Inlay Illustrator",
  description: "Asset Maid-based scene illustration and character asset manager.",
  keywords: ["image", "illustration", "asset maid", "novelai"],
  iconSvg: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"8\" cy=\"10\" r=\"2\"/><path d=\"M21 16l-5-5L5 19\"/></svg>"
};

/** Host-page styles for chat-side surfaces (inlay images and the details lightbox). */
export const HOST_STYLES = `
  [data-inlay-illustrator="true"] img[role="button"]{cursor:zoom-in}[data-inlay-illustrator="true"] img[role="button"]:focus-visible{outline:3px solid var(--lumiverse-primary);outline-offset:3px}
  .inlay-illustrator-placeholder{box-sizing:border-box;margin:10px auto;width:min(100%,720px);padding:12px 14px;border:1px dashed currentColor;border-radius:8px;text-align:center;opacity:.72}
  .inlay-lightbox-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start;min-width:0}
  .inlay-lightbox-image{display:block;width:100%;height:auto;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;background:#080808}
  .inlay-lightbox-prompt-panel{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 150px);border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);overflow:auto}
  .inlay-lightbox-prompt-panel h3{flex:none;margin:0;padding:12px 14px;border-bottom:1px solid var(--lumiverse-border);font-size:14px;color:var(--lumiverse-text)}
  .inlay-lightbox-meta{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
  .inlay-lightbox-meta span{padding:4px 8px;border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);font-size:11px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-block{min-width:0;padding:12px 14px 0}
  .inlay-lightbox-prompt-block:last-child{padding-bottom:14px}
  .inlay-lightbox-prompt-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}.inlay-lightbox-prompt-block h4{margin:0;font-size:12px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-heading button{border:0;background:transparent;color:var(--lumiverse-primary);padding:3px 5px;cursor:pointer;font:inherit;font-size:11px;font-weight:600}
  .inlay-lightbox-prompt{min-height:80px;margin:0;padding:10px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lumiverse-text)}
  @media(max-width:800px){.inlay-lightbox-layout{grid-template-columns:1fr}.inlay-lightbox-image{max-height:55vh}.inlay-lightbox-prompt-panel{max-height:35vh}}
`;
