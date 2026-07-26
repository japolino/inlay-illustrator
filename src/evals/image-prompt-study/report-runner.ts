import { dirname, join, resolve } from "node:path";
import type { ImageStudyManifest, StudyJudgmentExport } from "./types.js";
import { renderJudgmentReport } from "./report.js";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const manifestPath = resolve(String(args.get("manifest") || ""));
const judgmentsPath = resolve(String(args.get("judgments") || ""));
if (!String(args.get("manifest") || "").trim() || !String(args.get("judgments") || "").trim()) {
  throw new Error("Pass --manifest=<run manifest.json> and --judgments=<exported judgments.json>.");
}
const manifest = JSON.parse(await Bun.file(manifestPath).text()) as ImageStudyManifest;
const judgments = JSON.parse(await Bun.file(judgmentsPath).text()) as StudyJudgmentExport;
const outputPath = resolve(String(args.get("output") || join(dirname(manifestPath), "report.md")));
const report = renderJudgmentReport(manifest, judgments);
await Bun.write(outputPath, `${report}\n`);
process.stdout.write(`${report}\nReport: ${outputPath}\n`);
