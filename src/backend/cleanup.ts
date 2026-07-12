import type { Config } from "../shared/config.js";
import { logStage } from "./logging.js";
import { renderPrompt } from "./prompt.js";
import type { AssembledPrompt, DanbooruPayload, DanbooruSuggestion } from "./types.js";
import { csvParts, parseCorsJson, unique } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const DANBOORU_CLEANUP_BATCH_SIZE = 16;

function descriptorCandidates(words: string[], suffix: string, original: string): string[] {
  const candidates: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const candidate = `${words.slice(index).join(" ")} ${suffix}`.trim();
    if (candidate.toLowerCase() !== original.toLowerCase()) candidates.push(candidate);
  }
  return unique(candidates);
}

/** Each group contains alternatives from most to least specific. */
function localCandidateGroups(tag: string): string[][] {
  const lower = tag.toLowerCase();
  const groups: string[][] = [];
  if (lower === "exterior") groups.push(["outdoors"]);
  if (lower === "smug smirk") groups.push(["smirk"], ["smug"]);
  if (lower.includes("pleated mini skirt")) groups.push(["pleated skirt"], ["miniskirt"]);
  if (lower === "revealing dark purple dress") groups.push(["purple dress"], ["revealing clothes"]);

  const hair = lower.match(/\b(.+?)\s+hair\b/);
  if (hair) {
    const words = hair[1].trim().split(/\s+/);
    const length = words.find((word) => word === "long" || word === "short" || word === "medium");
    const descriptors = words.filter((word) => word !== length);
    const descriptorGroup = descriptorCandidates(descriptors, "hair", lower);
    if (descriptorGroup.length) groups.push(descriptorGroup);
    if (length && `${length} hair` !== lower) groups.push([`${length} hair`]);
  }

  const eyes = lower.match(/\b(.+?)\s+(?:irises|eyes)\b/);
  if (eyes && !lower.includes("pupils")) {
    const descriptorGroup = descriptorCandidates(eyes[1].trim().split(/\s+/), "eyes", lower);
    if (descriptorGroup.length) groups.push(descriptorGroup);
  }
  return groups.map((group) => unique(group));
}

function localCandidates(tag: string): string[] {
  return localCandidateGroups(tag).flat();
}

function bestSuggestion(suggestions: DanbooruSuggestion[]): DanbooruSuggestion | undefined {
  let best: DanbooruSuggestion | undefined;
  for (const suggestion of suggestions) {
    if (!suggestion.tag || typeof suggestion.score !== "number") continue;
    if (!best || suggestion.score > (best.score || 0)) best = suggestion;
  }
  return best;
}

export async function cleanupPrompt(prompt: AssembledPrompt, config: Config): Promise<string> {
  const endpoint = config.danbooruEndpoint.trim();
  if (!config.danbooruCleanup || !endpoint) {
    logStage(config, "danbooru_cleanup_skipped", { enabled: config.danbooruCleanup, endpointConfigured: Boolean(endpoint) });
    return renderPrompt(prompt, config.promptSyntax);
  }
  const sectionTags = prompt.tagSections.map((section) => csvParts(section));
  const tags = sectionTags.flat();
  const requestTags = unique(tags.flatMap((tag) => [tag, ...localCandidates(tag)]));
  const batches: string[][] = [];
  for (let start = 0; start < requestTags.length; start += DANBOORU_CLEANUP_BATCH_SIZE) {
    batches.push(requestTags.slice(start, start + DANBOORU_CLEANUP_BATCH_SIZE));
  }
  const cleanupStartedAt = Date.now();
  logStage(config, "danbooru_cleanup_start", {
    endpoint,
    tagCount: tags.length,
    requestTagCount: requestTags.length,
    batchCount: batches.length
  });
  try {
    const valid: string[] = [];
    const suggestions: Record<string, DanbooruSuggestion[]> = {};
    for (const [index, batch] of batches.entries()) {
      const batchNumber = index + 1;
      const batchStartedAt = Date.now();
      logStage(config, "danbooru_cleanup_batch_start", { batchNumber, batchCount: batches.length, tagCount: batch.length });
      try {
        const response = parseCorsJson<DanbooruPayload>(await spindle.cors(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ tags: batch })
        }), `Danbooru cleanup batch ${batchNumber}/${batches.length}`);
        valid.push(...(response.valid || response.data?.valid || []));
        const batchSuggestions = response.suggestions || response.data?.suggestions || {};
        for (const [tag, entries] of Object.entries(batchSuggestions)) {
          const key = tag.toLowerCase();
          suggestions[key] = [...(suggestions[key] || []), ...entries];
        }
        logStage(config, "danbooru_cleanup_batch_done", {
          batchNumber,
          batchCount: batches.length,
          tagCount: batch.length,
          elapsedMs: Date.now() - batchStartedAt
        });
      } catch (error) {
        logStage(config, "danbooru_cleanup_batch_failed", {
          batchNumber,
          batchCount: batches.length,
          tagCount: batch.length,
          elapsedMs: Date.now() - batchStartedAt,
          error: error instanceof Error ? error.message : String(error)
        }, "warn");
        throw error;
      }
    }
    const validKeys = new Set(valid.map((tag) => tag.toLowerCase()));
    const replacementsFor = (tag: string): string[] => {
      const key = tag.toLowerCase();
      if (validKeys.has(key)) return [tag];

      const decomposed = localCandidateGroups(tag)
        .map((group) => group.find((candidate) => validKeys.has(candidate.toLowerCase())))
        .filter((candidate): candidate is string => Boolean(candidate));
      if (decomposed.length > 0) return unique(decomposed);

      const best = bestSuggestion(suggestions[key] || []);
      if (best?.tag && (best.score || 0) >= 0.88) return [best.tag];
      return [tag];
    };
    const seen = new Set<string>();
    const cleanedSections = sectionTags.map((section) => unique(section.flatMap(replacementsFor))
      .filter((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(", "));
    const cleaned = renderPrompt({ ...prompt, tagSections: cleanedSections }, config.promptSyntax);
    logStage(config, "danbooru_cleanup_done", {
      beforeTagCount: tags.length,
      afterTagCount: cleanedSections.flatMap((section) => csvParts(section)).length,
      batchCount: batches.length,
      elapsedMs: Date.now() - cleanupStartedAt
    });
    return cleaned;
  } catch (error) {
    spindle.log.warn(`Danbooru cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    return renderPrompt(prompt, config.promptSyntax);
  }
}
