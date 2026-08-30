export const CLEANUP_KEY = "__inlayIllustratorCleanup";

export const INLAY_ICON_SVG = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"8\" cy=\"10\" r=\"2\"/><path d=\"M21 16l-5-5L5 19\"/></svg>";

export const INLAY_SETTINGS_DESCRIPTION = "Generate, reroll, edit, and organize message illustrations with the original Inlay Image v3.5 workflow.";

export const PANEL_STYLES = `
  .inlay-settings-host{display:block;width:100%;min-width:0;box-sizing:border-box;color:var(--lumiverse-text);container:inlay-settings/inline-size}
  .inlay-settings-page{width:100%;max-width:1480px;margin:0 auto;padding:clamp(16px,2.5vw,32px);display:flex;flex-direction:column;gap:18px;box-sizing:border-box;overflow-x:clip}
  .inlay-settings-header{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,380px);align-items:center;gap:20px;padding:20px 22px;border:1px solid var(--lumiverse-border);border-radius:12px;background:var(--lumiverse-fill-subtle)}
  .inlay-settings-identity{display:flex;align-items:center;gap:14px;min-width:0}
  .inlay-settings-icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border:1px solid var(--lumiverse-border);border-radius:12px;background:var(--lumiverse-fill);color:var(--lumiverse-primary)}
  .inlay-settings-icon svg{width:27px;height:27px}
  .inlay-settings-heading{min-width:0}
  .inlay-settings-heading h2{margin:0;color:var(--lumiverse-text);font:inherit;font-size:clamp(20px,2vw,26px);font-weight:700;line-height:1.2}
  .inlay-settings-heading p{max-width:760px;margin:6px 0 0;color:var(--lumiverse-text-muted);font-size:13px;line-height:1.5;overflow-wrap:anywhere}
  .inlay-panel{display:contents}
  .inlay-sections,.inlay-section-host,.inlay-section-body,.inlay-row,.inlay-control{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;align-items:start}
  .inlay-section-host{grid-column:span 6;width:100%;overflow:hidden;border:1px solid var(--lumiverse-border);border-radius:10px;background:var(--lumiverse-fill-subtle)}
  .inlay-section-prompt-output,.inlay-section-character-memory,.inlay-section-caption-style{grid-column:1/-1}
  .inlay-section-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:11px 14px;border:0;background:transparent;color:var(--lumiverse-text);font:inherit;font-size:14px;font-weight:650;text-align:left;cursor:pointer}
  .inlay-section-toggle:hover{background:var(--lumiverse-fill-hover)}
  .inlay-section-toggle:focus-visible,.inlay-actions button:focus-visible,.inlay-row input:focus-visible,.inlay-row textarea:focus-visible,.inlay-row select:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:2px}
  .inlay-section-chevron{flex:none;font-size:20px;line-height:1;transform:rotate(0deg);transition:transform .15s ease}
  .inlay-section-host[data-expanded="true"] .inlay-section-chevron{transform:rotate(90deg)}
  .inlay-section-body{display:flex;flex-direction:column;gap:12px;padding:6px 14px 16px}
  .inlay-section-body[hidden]{display:none}
  .inlay-caption-preview{position:relative;display:block;box-sizing:border-box;min-height:110px;padding:18px;border-radius:10px;background:linear-gradient(135deg,#17131f,#302440);color:#fff}
  .inlay-row{display:grid;grid-template-columns:minmax(150px,190px) minmax(0,1fr);align-items:center;gap:8px 14px;font-size:13px}
  .inlay-row>*{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row>label{color:var(--lumiverse-text-muted);line-height:1.35;overflow-wrap:anywhere}
  .inlay-control{width:100%}
  .inlay-select-control,.inlay-select-trigger,.inlay-native-select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row input,.inlay-row textarea,.inlay-row select{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;font:inherit}
  .inlay-row textarea{min-height:112px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.5}
  .inlay-row-textarea{grid-template-columns:1fr;align-items:start}
  .inlay-row-textarea>.inlay-control,.inlay-row-textarea>.inlay-hint{grid-column:1}
  .inlay-row-textarea>label{font-weight:600;color:var(--lumiverse-text)}
  .inlay-range-choice{display:flex;flex-direction:column;gap:5px;width:100%}
  .inlay-range-choice input[type="range"]{padding:0;border:0;background:transparent;accent-color:var(--lumiverse-accent)}
  .inlay-range-choice input[type="range"]:disabled{opacity:.55}
  .inlay-range-labels{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;color:var(--lumiverse-text-muted);font-size:11px;text-align:center}
  .inlay-range-labels span:first-child{text-align:left}.inlay-range-labels span:last-child{text-align:right}
  .inlay-range-labels .is-active{color:var(--lumiverse-text);font-weight:600}
  .inlay-hint{grid-column:2;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.4;overflow-wrap:anywhere}
  .inlay-actions{display:flex;flex-wrap:wrap;gap:8px}
  .inlay-actions button{min-height:38px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 11px;cursor:pointer;font:inherit}
  .inlay-actions button:hover{background:var(--lumiverse-fill-hover)}
  .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
  .inlay-subtitle{font-size:13px;font-weight:650;margin:3px 0}
  .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.45;overflow-wrap:anywhere}
  .inlay-status{min-width:0;padding:10px 12px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill);font-size:12px;line-height:1.45;color:var(--lumiverse-text-muted);white-space:pre-wrap;overflow-wrap:anywhere;min-height:20px}
  @container inlay-settings (max-width:1100px){
    .inlay-settings-header{grid-template-columns:1fr}
    .inlay-sections{grid-template-columns:1fr}
    .inlay-section-host,.inlay-section-prompt-output,.inlay-section-character-memory,.inlay-section-caption-style{grid-column:1}
  }
  @container inlay-settings (max-width:680px){
    .inlay-settings-page{padding:12px;gap:12px}
    .inlay-settings-header{padding:15px;gap:14px}
    .inlay-settings-icon{flex-basis:42px;width:42px;height:42px}
    .inlay-row,.inlay-row-textarea{grid-template-columns:1fr;gap:6px}
    .inlay-row>.inlay-control,.inlay-row>.inlay-hint{grid-column:1}
    .inlay-section-body{padding:5px 12px 14px}
    .inlay-actions button{flex:1 1 140px}
  }
  .inlay-lightbox-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start;min-width:0}
  .inlay-lightbox-visual{display:flex;flex-direction:column;gap:8px;min-width:0}
  .inlay-lightbox-image{display:block;width:100%;height:auto;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;background:#080808}
  .inlay-lightbox-quote{margin:0;padding:12px 18px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);color:var(--lumiverse-text);font-size:16px;font-style:italic;text-align:center}
  .inlay-lightbox-prompt-panel{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 150px);border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);overflow:auto}
  .inlay-lightbox-prompt-panel h3{flex:none;margin:0;padding:12px 14px;border-bottom:1px solid var(--lumiverse-border);font-size:14px;color:var(--lumiverse-text)}
  .inlay-lightbox-meta{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
  .inlay-lightbox-meta span{padding:4px 8px;border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);font-size:11px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-block{min-width:0;padding:12px 14px 0}
  .inlay-lightbox-prompt-block:last-child{padding-bottom:14px}
  .inlay-lightbox-prompt-block h4{margin:0 0 6px;font-size:12px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt{min-height:80px;margin:0;padding:10px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lumiverse-text)}
  .inlay-lightbox-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px}
  .inlay-lightbox-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-lightbox-actions button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-lightbox-actions button:disabled{opacity:.55;cursor:wait}
  .inlay-lightbox-action-status{grid-column:1/-1;min-height:16px;color:var(--lumiverse-text-muted);font-size:11px;line-height:1.35}
  .inlay-gallery{width:100%;display:flex;flex-direction:column;gap:12px;min-width:0}
  .inlay-gallery-nav{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle)}
  .inlay-gallery-nav button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:6px 8px;font:inherit;font-size:12px;cursor:pointer}
  .inlay-gallery-nav button[aria-current="true"],.inlay-gallery-nav button.is-active{background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast);border-color:var(--lumiverse-primary)}
  .inlay-gallery-nav button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-gallery-nav button:disabled{opacity:.5;cursor:not-allowed}
  .inlay-gallery-pagination{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);font-size:12px}
  .inlay-gallery-pagination button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:6px 10px;font:inherit;cursor:pointer}
  .inlay-gallery-pagination button:disabled{opacity:.5;cursor:not-allowed}
  .inlay-gallery-content{display:flex;flex-direction:column;gap:16px;max-height:60vh;overflow:auto;padding:4px}
  .inlay-gallery-chat{width:100%;display:flex;flex-direction:column;gap:8px}
  .inlay-gallery-chat-heading{font-size:13px;font-weight:600;color:var(--lumiverse-text);padding:6px 0;border-bottom:1px solid var(--lumiverse-border)}
  .inlay-gallery-chat-meta{font-size:12px;color:var(--lumiverse-text-muted);margin-top:-2px;padding-bottom:2px}
  .inlay-gallery-grid{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
  .inlay-gallery-card{width:calc(33% - 8px);min-width:160px;display:flex;flex-direction:column;gap:6px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill);overflow:hidden}
  .inlay-gallery-badge{align-self:flex-start;margin:8px 8px 0;padding:2px 6px;border-radius:999px;background:var(--lumiverse-fill-subtle);border:1px solid var(--lumiverse-border);font-size:11px;color:var(--lumiverse-text-muted)}
  .inlay-gallery-image-wrap{padding:0 8px}
  .inlay-gallery-image-wrap img{display:block;width:100%;height:auto;max-height:40vh;object-fit:contain;border-radius:6px;cursor:zoom-in;background:#080808}
  .inlay-gallery-quote{margin:0 8px 8px;padding:8px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill-subtle);font-size:12px;font-style:italic;color:var(--lumiverse-text);white-space:pre-wrap;overflow-wrap:anywhere}
  .inlay-gallery-status{padding:8px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text-muted)}
  .inlay-gallery-empty{padding:20px;text-align:center;color:var(--lumiverse-text-muted);font-size:13px;border:1px dashed var(--lumiverse-border);border-radius:8px}
  @media(max-width:800px){.inlay-gallery-card{width:calc(50% - 8px)}.inlay-gallery-content{max-height:65vh}}
`;
