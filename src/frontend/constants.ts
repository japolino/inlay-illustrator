export const CLEANUP_KEY = "__inlayIllustratorCleanup";

export const DRAWER_TAB_OPTIONS = {
  id: "inlay_illustrator",
  title: "Inlay Illustrator",
  shortName: "Inlay",
  headerTitle: "Inlay Illustrator",
  description: "Generate Inlay-style illustration batches from completed messages.",
  keywords: ["image", "illustration", "anima"],
  iconSvg: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"8\" cy=\"10\" r=\"2\"/><path d=\"M21 16l-5-5L5 19\"/></svg>"
};

export const PANEL_STYLES = `
  .inlay-panel{width:100%;padding:12px;color:var(--lumiverse-text);display:flex;flex-direction:column;gap:10px;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections,.inlay-section-host,.inlay-section-body,.inlay-row,.inlay-control{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections{display:flex;flex-direction:column;gap:8px}
  .inlay-section-host{width:100%;contain:inline-size;overflow:hidden;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle)}
  .inlay-section-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:10px 12px;border:0;background:transparent;color:var(--lumiverse-text);font:inherit;font-size:13px;font-weight:600;text-align:left;cursor:pointer}
  .inlay-section-toggle:hover{background:var(--lumiverse-fill-hover)}
  .inlay-section-toggle:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:-2px}
  .inlay-section-chevron{flex:none;font-size:20px;line-height:1;transform:rotate(0deg);transition:transform .15s ease}
  .inlay-section-host[data-expanded="true"] .inlay-section-chevron{transform:rotate(90deg)}
  .inlay-section-body{display:flex;flex-direction:column;gap:10px;padding:4px 12px 12px}
  .inlay-section-body[hidden]{display:none}
  .inlay-row{display:grid;grid-template-columns:minmax(116px,.9fr) minmax(0,1.1fr);align-items:center;gap:8px;font-size:13px}
  .inlay-row>*{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row label{color:var(--lumiverse-text-muted)}
  .inlay-select-control,.inlay-select-trigger,.inlay-native-select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row input,.inlay-row textarea,.inlay-row select{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:7px 9px;font:inherit}
  .inlay-row textarea{min-height:76px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
  .inlay-hint{grid-column:2;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.35}
  .inlay-actions{display:flex;flex-wrap:wrap;gap:8px}
  .inlay-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-actions button:hover{background:var(--lumiverse-fill-hover)}
  .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
  .inlay-subtitle{font-size:13px;font-weight:600;margin:2px 0}
  .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.4}
  .inlay-status{padding:9px 10px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text-muted);white-space:pre-wrap;min-height:18px}
  .inlay-lightbox-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start;min-width:0}
  .inlay-lightbox-image{display:block;width:100%;height:auto;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;background:#080808}
  .inlay-lightbox-prompt-panel{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 150px);border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);overflow:hidden}
  .inlay-lightbox-prompt-panel h3{flex:none;margin:0;padding:12px 14px;border-bottom:1px solid var(--lumiverse-border);font-size:14px;color:var(--lumiverse-text)}
  .inlay-lightbox-prompt{flex:1;min-height:120px;margin:0;padding:14px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lumiverse-text)}
  @media(max-width:800px){.inlay-lightbox-layout{grid-template-columns:1fr}.inlay-lightbox-image{max-height:55vh}.inlay-lightbox-prompt-panel{max-height:35vh}}
`;
