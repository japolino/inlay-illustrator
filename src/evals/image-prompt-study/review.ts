import { relative } from "node:path";
import type { ImageStudyManifest, PromptCandidate } from "./types.js";

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function pairs<T>(values: T[]): Array<[T, T]> {
  const output: Array<[T, T]> = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) output.push([values[left], values[right]]);
  }
  return output;
}

function stableFlip(value: string): boolean {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2 === 0;
}

export function reviewItems(manifest: ImageStudyManifest, reviewPath: string) {
  const candidatesByCase = new Map(manifest.cases.map((entry) => [entry.id, new Map(entry.candidates.map((candidate) => [candidate.id, candidate]))]));
  const imagesByKey = new Map(manifest.images.map((image) => [`${image.caseId}\u0000${image.candidateId}\u0000${image.seed}`, image]));
  return manifest.cases.flatMap((studyCase) => manifest.seeds.flatMap((seed) => pairs(studyCase.candidates).flatMap(([first, second]) => {
    const firstImage = imagesByKey.get(`${studyCase.id}\u0000${first.id}\u0000${seed}`);
    const secondImage = imagesByKey.get(`${studyCase.id}\u0000${second.id}\u0000${seed}`);
    if (!firstImage || !secondImage) return [];
    const flip = stableFlip(`${manifest.runId}:${studyCase.id}:${seed}:${first.id}:${second.id}`);
    const left = flip ? secondImage : firstImage;
    const right = flip ? firstImage : secondImage;
    const candidateMap = candidatesByCase.get(studyCase.id) || new Map<string, PromptCandidate>();
    return [{
      id: `${studyCase.id}--${seed}--${first.id}--${second.id}`,
      caseId: studyCase.id,
      scenario: studyCase.scenario,
      paragraph: studyCase.paragraph,
      description: studyCase.description,
      source: studyCase.source,
      expectations: studyCase.expectations,
      seed,
      left: { image: relative(reviewPath, left.localPath).replace(/\\/g, "/").replace(/^\.\.\//, ""), candidate: candidateMap.get(left.candidateId) },
      right: { image: relative(reviewPath, right.localPath).replace(/\\/g, "/").replace(/^\.\.\//, ""), candidate: candidateMap.get(right.candidateId) }
    }];
  })));
}

export function renderReviewHtml(manifest: ImageStudyManifest, reviewPath: string): string {
  const items = reviewItems(manifest, reviewPath);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inlay image prompt study ${manifest.runId}</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101114;color:#eee}body{margin:0;padding:18px}.top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px}.card{background:#191b20;border:1px solid #343842;border-radius:12px;padding:16px;max-width:1500px;margin:auto}.source{white-space:pre-wrap;background:#111318;padding:10px;border-radius:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.choice{border:2px solid #343842;border-radius:10px;padding:8px;background:#0c0d10}.choice img{display:block;width:100%;max-height:68vh;object-fit:contain;background:#050506;border-radius:7px}.rubric{display:grid;gap:7px;margin-top:14px}.rubric-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px;background:#111318;border-radius:7px}.rubric-label{width:170px;font-weight:600}.controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}button{background:#2b303b;color:#fff;border:1px solid #4b5363;border-radius:7px;padding:9px 13px;cursor:pointer}button:hover{background:#394052}.selected{outline:2px solid #7eb6ff;background:#35465f}.meta{display:none;margin-top:12px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px}.meta.visible{display:block}.muted{color:#aeb4c0}@media(max-width:800px){.grid{grid-template-columns:1fr}.choice img{max-height:55vh}.rubric-label{width:100%}}
</style></head><body><div class="card">
<div class="top"><strong id="progress"></strong><span class="muted">Judge source fidelity first, then composition and aesthetics.</span><button id="export">Export judgments</button></div>
<h2 id="title"></h2><div id="source" class="source"></div><ul id="expectations"></ul>
<div class="grid"><div class="choice"><div>Left</div><img id="left"></div><div class="choice"><div>Right</div><img id="right"></div></div>
<div id="rubric" class="rubric"></div>
<div class="controls"><strong>Overall:</strong><button data-vote="left">Left wins</button><button data-vote="right">Right wins</button><button data-vote="tie">Tie</button><button data-vote="both_fail">Both fail</button><button id="back">Back</button><button id="reveal">Reveal prompts</button></div>
<div id="meta" class="meta"></div></div>
<script>const run=${jsonForScript({ runId: manifest.runId, workflowHash: manifest.workflowHash })};const items=${jsonForScript(items)};
const storageKey='inlay-image-study:'+run.runId;let answers=JSON.parse(localStorage.getItem(storageKey)||'{}');let index=0;const dimensions={identityAttire:'Identity & attire',actionOwnership:'Action ownership',environmentCamera:'Environment & camera',emotionalTone:'Emotional tone',aesthetics:'Aesthetics'};const dimensionVotes=[['left','Left'],['right','Right'],['tie','Tie'],['both_fail','Both fail'],['not_applicable','N/A']];
const byId=id=>document.getElementById(id);function ensure(item){answers[item.id]||={caseId:item.caseId,seed:item.seed,leftCandidate:item.left.candidate.id,rightCandidate:item.right.candidate.id,dimensions:{}};answers[item.id].dimensions||={};return answers[item.id]}function renderRubric(item){byId('rubric').innerHTML='';Object.entries(dimensions).forEach(([key,label])=>{const row=document.createElement('div');row.className='rubric-row';const heading=document.createElement('span');heading.className='rubric-label';heading.textContent=label;row.appendChild(heading);dimensionVotes.forEach(([value,text])=>{const button=document.createElement('button');button.textContent=text;button.dataset.dimension=key;button.dataset.dimensionVote=value;button.classList.toggle('selected',answers[item.id]?.dimensions?.[key]===value);button.onclick=()=>{const answer=ensure(item);answer.dimensions[key]=value;answer.recordedAt=new Date().toISOString();localStorage.setItem(storageKey,JSON.stringify(answers));renderRubric(item)};row.appendChild(button)});byId('rubric').appendChild(row)})}function render(){if(!items.length){byId('title').textContent='No complete pairs were generated.';return}const item=items[index];byId('progress').textContent=(index+1)+' / '+items.length;byId('title').textContent=item.caseId+' · seed '+item.seed;byId('source').textContent=item.source;byId('expectations').innerHTML='';item.expectations.forEach(x=>{const li=document.createElement('li');li.textContent=x;byId('expectations').appendChild(li)});byId('left').src=item.left.image;byId('right').src=item.right.image;byId('meta').className='meta';byId('meta').textContent='LEFT\n'+JSON.stringify(item.left.candidate,null,2)+'\n\nRIGHT\n'+JSON.stringify(item.right.candidate,null,2);document.querySelectorAll('[data-vote]').forEach(b=>b.classList.toggle('selected',answers[item.id]?.vote===b.dataset.vote));renderRubric(item)}
function vote(value){const item=items[index];const answer=ensure(item);answer.vote=value;answer.recordedAt=new Date().toISOString();localStorage.setItem(storageKey,JSON.stringify(answers));if(index<items.length-1)index++;render()}document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>vote(b.dataset.vote));byId('back').onclick=()=>{if(index>0)index--;render()};byId('reveal').onclick=()=>byId('meta').classList.toggle('visible');byId('export').onclick=()=>{const blob=new Blob([JSON.stringify({...run,exportedAt:new Date().toISOString(),answers},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='image-study-${manifest.runId}-judgments.json';a.click();URL.revokeObjectURL(a.href)};render();</script></body></html>`;
}
