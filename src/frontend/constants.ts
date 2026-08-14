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
  .inlay-panel{width:100%;padding:12px;color:var(--lumiverse-text);display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-overview{position:relative;overflow:hidden;padding:14px;border:1px solid var(--lumiverse-border);border-radius:12px;background:linear-gradient(145deg,var(--lumiverse-fill-subtle),var(--lumiverse-fill));box-shadow:0 10px 28px rgba(0,0,0,.08)}
  .inlay-overview::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:var(--lumiverse-primary)}
  .inlay-overview-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
  .inlay-overview h2{margin:2px 0 4px;font-size:18px;line-height:1.2;color:var(--lumiverse-text)}
  .inlay-overview p{max-width:42ch;margin:0;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.45}
  .inlay-eyebrow{color:var(--lumiverse-primary);font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
  .inlay-power-button{flex:none;min-width:62px;border:1px solid var(--lumiverse-border);border-radius:999px;padding:6px 10px;background:var(--lumiverse-fill);color:var(--lumiverse-text-muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer}
  .inlay-power-button[data-enabled="true"]{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast)}
  .inlay-overview-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .inlay-overview-meta span,.inlay-section-badge{border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);color:var(--lumiverse-text-muted);font-size:10px;line-height:1;padding:5px 7px;white-space:nowrap}
  .inlay-overview-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:12px}
  .inlay-overview-actions button,.inlay-memory-card button{border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 11px;cursor:pointer;font:inherit;font-size:12px;font-weight:600}
  .inlay-overview-actions button:hover:not(:disabled),.inlay-memory-card button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-overview-actions button:disabled,.inlay-memory-card button:disabled,.inlay-actions button:disabled{opacity:.48;cursor:not-allowed}
  .inlay-status{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border:1px solid var(--lumiverse-border);border-radius:9px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text);white-space:pre-wrap;min-height:20px}
  .inlay-status-dot{flex:none;width:8px;height:8px;margin-top:4px;border-radius:50%;background:var(--lumiverse-text-muted);box-shadow:0 0 0 3px color-mix(in srgb,var(--lumiverse-text-muted) 15%,transparent)}
  .inlay-status-label{display:block;margin-bottom:2px;color:var(--lumiverse-text-muted);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .inlay-status-text{display:block;line-height:1.4;overflow-wrap:anywhere}
  .inlay-status[data-tone="active"] .inlay-status-dot{background:var(--lumiverse-primary);animation:inlay-pulse 1.5s ease-in-out infinite}
  .inlay-status[data-tone="success"] .inlay-status-dot{background:#34a853}.inlay-status[data-tone="warning"] .inlay-status-dot{background:#e2a93b}.inlay-status[data-tone="error"] .inlay-status-dot{background:#d9534f}
  @keyframes inlay-pulse{50%{opacity:.4;transform:scale(.8)}}
  .inlay-sections,.inlay-section-host,.inlay-section-body,.inlay-row,.inlay-control{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections{display:flex;flex-direction:column;gap:8px}
  .inlay-section-host{width:100%;contain:inline-size;overflow:hidden;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle)}
  .inlay-section-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px 12px;border:0;background:transparent;color:var(--lumiverse-text);font:inherit;text-align:left;cursor:pointer}
  .inlay-section-heading{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.inlay-section-title{font-size:13px;font-weight:700}.inlay-section-description{color:var(--lumiverse-text-muted);font-size:11px;font-weight:400;line-height:1.3}
  .inlay-section-trailing{display:flex;align-items:center;gap:6px;min-width:0}
  .inlay-section-toggle:hover{background:var(--lumiverse-fill-hover)}
  .inlay-section-toggle:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:-2px}
  .inlay-section-chevron{flex:none;font-size:20px;line-height:1;transform:rotate(0deg);transition:transform .15s ease}
  .inlay-section-host[data-expanded="true"] .inlay-section-chevron{transform:rotate(90deg)}
  .inlay-section-body{display:flex;flex-direction:column;gap:10px;padding:4px 12px 12px}
  .inlay-section-body[hidden]{display:none}
  .inlay-row{display:grid;grid-template-columns:minmax(116px,.9fr) minmax(0,1.1fr);align-items:center;gap:8px;font-size:13px}
  .inlay-row>*{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row-full{grid-template-columns:1fr}.inlay-row-full .inlay-control,.inlay-row-full .inlay-hint{grid-column:1}.inlay-row-full>label{font-weight:600;color:var(--lumiverse-text)}
  .inlay-row label{color:var(--lumiverse-text-muted)}
  .inlay-select-control,.inlay-select-trigger,.inlay-native-select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row input,.inlay-row textarea,.inlay-row select{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:7px 9px;font:inherit}
  .inlay-row textarea{min-height:76px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
  .inlay-range-choice{display:flex;flex-direction:column;gap:4px;width:100%}
  .inlay-range-choice input[type="range"]{padding:0;border:0;background:transparent;accent-color:var(--lumiverse-accent)}
  .inlay-range-choice input[type="range"]:disabled{opacity:.55}
  .inlay-range-labels{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;color:var(--lumiverse-text-muted);font-size:11px;text-align:center}
  .inlay-range-labels span:first-child{text-align:left}.inlay-range-labels span:last-child{text-align:right}
  .inlay-range-labels .is-active{color:var(--lumiverse-text);font-weight:600}
  .inlay-hint{grid-column:2;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.35}
  .inlay-actions{display:flex;flex-wrap:wrap;gap:8px}
  .inlay-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-actions button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-panel button:focus-visible,.inlay-panel input:focus-visible,.inlay-panel textarea:focus-visible,.inlay-panel select:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:2px}
  .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
  .inlay-subtitle{font-size:13px;font-weight:600;margin:2px 0}
  .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.4}
  .inlay-notice{padding:9px 10px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill);color:var(--lumiverse-text-muted);font-size:11px;line-height:1.45}.inlay-notice[data-tone="warning"]{border-color:#b78a32;color:var(--lumiverse-text)}.inlay-notice[data-tone="error"]{border-color:#b94a48;color:var(--lumiverse-text)}
  .inlay-field-message{margin-top:5px;color:var(--lumiverse-text-muted);font-size:10px;line-height:1.35}.inlay-field-message[data-tone="success"]{color:#4cae6a}.inlay-field-message[data-tone="error"]{color:#e06b67}.inlay-json-field textarea[aria-invalid="true"]{border-color:#d9534f}
  .inlay-memory-list{display:flex;flex-direction:column;gap:8px}.inlay-memory-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill)}.inlay-memory-card-new{border-style:dashed;background:transparent}
  .inlay-memory-card-header{display:flex;align-items:center;gap:8px}.inlay-memory-name{font-weight:700}.inlay-memory-card input,.inlay-memory-card textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill-subtle);color:var(--lumiverse-text);padding:7px 9px;font:inherit}.inlay-memory-card textarea{resize:vertical;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
  .inlay-memory-field{display:flex;flex-direction:column;gap:5px;color:var(--lumiverse-text-muted);font-size:11px}.inlay-memory-card-header .inlay-icon-button{flex:none;padding:7px 9px}.inlay-danger{color:#e06b67!important}.inlay-memory-save{align-self:flex-start}
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
  .inlay-lightbox-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px}
  .inlay-lightbox-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-lightbox-actions button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-lightbox-actions button:disabled{opacity:.55;cursor:wait}
  .inlay-lightbox-action-status{grid-column:1/-1;min-height:16px;color:var(--lumiverse-text-muted);font-size:11px;line-height:1.35}
  @media(max-width:800px){.inlay-lightbox-layout{grid-template-columns:1fr}.inlay-lightbox-image{max-height:55vh}.inlay-lightbox-prompt-panel{max-height:35vh}}
  @media(max-width:520px){.inlay-panel{padding:9px}.inlay-row{grid-template-columns:1fr;gap:5px}.inlay-hint{grid-column:1}.inlay-section-description{display:none}.inlay-section-badge{max-width:140px;overflow:hidden;text-overflow:ellipsis}.inlay-overview-heading{gap:8px}}
  @media(max-width:340px){.inlay-overview-actions{grid-template-columns:1fr}.inlay-overview-actions button{width:100%}}
  @media(prefers-reduced-motion:reduce){.inlay-section-chevron,.inlay-status-dot{transition:none!important;animation:none!important}}
`;
