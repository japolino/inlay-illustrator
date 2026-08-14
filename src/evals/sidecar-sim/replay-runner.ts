import { resolve } from "node:path";
import { expandedSidecarScenarios } from "./expanded-scenarios.js";
import { nsfwSidecarScenarios } from "./nsfw-scenarios.js";
import { replaySidecarArtifact, type SavedSidecarArtifact } from "./replay.js";
import { sidecarScenarios } from "./scenarios.js";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const sourceRoot = resolve(String(args.get("source-root") || "eval-results/raw"));
const scenarioFilter = String(args.get("scenario") || "").toLowerCase();
const modelFilter = String(args.get("model") || "").toLowerCase();
const maxFiles = Math.max(1, Math.min(5000, Number(args.get("max-files") || 200)));
const allowDifferences = args.get("allow-differences") === "true";
const localCameraRepair = args.get("local-camera-repair") !== "off";
const scenarios = new Map([
  ...sidecarScenarios,
  ...nsfwSidecarScenarios,
  ...expandedSidecarScenarios
].map((scenario) => [scenario.id, scenario] as const));

const files: string[] = [];
for await (const relative of new Bun.Glob("**/*.json").scan({ cwd: sourceRoot, onlyFiles: true })) {
  files.push(String(relative));
}
files.sort();
let matched = 0;
let identical = 0;
let different = 0;
let failed = 0;
let skipped = 0;
let strictJson = 0;
let missingTerminalState = 0;
let missingPrimaryAction = 0;
let cameraRepairHits = 0;
let cameraCollisionsBefore = 0;
let cameraCollisionsAfter = 0;
const details: string[] = [];
for (const relative of files) {
  if (matched >= maxFiles) break;
  let artifact: SavedSidecarArtifact;
  try {
    artifact = await Bun.file(resolve(sourceRoot, relative)).json() as SavedSidecarArtifact;
  } catch {
    skipped += 1;
    continue;
  }
  if (!artifact?.scenario || typeof artifact.raw !== "string" || !Array.isArray(artifact.rendered)) {
    skipped += 1;
    continue;
  }
  if (scenarioFilter && !artifact.scenario.toLowerCase().includes(scenarioFilter)) continue;
  if (modelFilter && !String(artifact.model || "").toLowerCase().includes(modelFilter)) continue;
  const scenario = scenarios.get(artifact.scenario);
  if (!scenario) {
    skipped += 1;
    continue;
  }
  matched += 1;
  try {
    const replay = replaySidecarArtifact(artifact, scenario, { localCameraRepair });
    strictJson += replay.current.diagnostics.strictJson ? 1 : 0;
    missingTerminalState += replay.current.diagnostics.terminalStatePresent ? 0 : 1;
    missingPrimaryAction += replay.current.diagnostics.missingPrimaryActionCount;
    cameraRepairHits += replay.current.diagnostics.localCameraRepairApplied ? 1 : 0;
    cameraCollisionsBefore += replay.current.diagnostics.cameraCollisionsBefore;
    cameraCollisionsAfter += replay.current.diagnostics.cameraCollisionsAfter;
    if (replay.payloadEqual && replay.renderedEqual) identical += 1;
    else {
      different += 1;
      if (details.length < 20) {
        const changed = [
          replay.payloadEqual ? "" : "payload",
          replay.renderedEqual ? "" : "rendered"
        ].filter(Boolean).join("+");
        details.push(`DIFF ${artifact.scenario} ${artifact.model} ${changed}`);
      }
    }
  } catch (error) {
    failed += 1;
    if (details.length < 20) {
      details.push(`ERROR ${artifact.scenario} ${artifact.model} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

process.stdout.write([
  "Sidecar replay summary",
  `Source: ${sourceRoot}`,
  `Matched: ${matched}`,
  `Identical: ${identical}`,
  `Different: ${different}`,
  `Pipeline errors: ${failed}`,
  `Skipped: ${skipped}`,
  `Strict JSON: ${strictJson}/${matched}`,
  `Missing terminal state: ${missingTerminalState}`,
  `Missing Dynamic primaryAction: ${missingPrimaryAction}`,
  `Local camera repair: ${localCameraRepair ? "on" : "off"}`,
  `Local camera repair hits: ${cameraRepairHits}`,
  `Camera collisions: ${cameraCollisionsBefore} before / ${cameraCollisionsAfter} after`,
  ...details
].join("\n") + "\n");
if (!allowDifferences && (different > 0 || failed > 0)) process.exitCode = 1;
