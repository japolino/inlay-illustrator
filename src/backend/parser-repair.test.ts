import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { generateCreativeConcepts, parsePayloadWithRepair } from "./parser.js";
import type { ParserGenerationRequest } from "./types.js";

type RawRequest = { messages: ParserGenerationRequest["messages"] };

const requests: RawRequest[] = [];
const responses: unknown[] = [];
const infoLogs: string[] = [];
const connection = { id: "parser", name: "Parser", provider: "openai", model: "base-model" };
const config = {
  ...DEFAULT_CONFIG,
  debugLogging: false,
  parserConnectionId: connection.id,
  parserModel: "override-model",
  parserParameters: { temperature: 0 }
};
const messages: ParserGenerationRequest["messages"] = [{ role: "user", content: "Create scenes." }];

beforeEach(() => {
  requests.splice(0);
  responses.splice(0);
  infoLogs.splice(0);
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    generate: {
      raw: async (request: RawRequest) => {
        requests.push(request);
        return responses.shift();
      }
    },
    log: { info: (message: string) => infoLogs.push(message), warn: () => undefined, error: () => undefined }
  };
});

describe("parser JSON recovery", () => {
  test("extracts fenced JSON from surrounding text and repairs near-miss schema keys locally", async () => {
    responses.push({
      content: [
        "Here is the result:",
        "```json",
        '{"scense":[{"plase":"garden","shost":[{"paragaph":"P2","camra":"close-up"}]}]}',
        "```"
      ].join("\n")
    });

    const parsed = await parsePayloadWithRepair(connection, config, messages);

    expect(parsed).toEqual({
      scenes: [{ place: "garden", shots: [{ paragraph: "P2", camera: "close-up" }] }]
    });
    expect(requests).toHaveLength(1);
  });

  test("collects standalone shot objects when the response omits the top-level scenes wrapper", async () => {
    responses.push({
      content: [
        "Shot candidates:",
        '{"paragraph":1,"camera":"wide shot"}',
        '{"paragraph":"P2","camera":"close-up","action":"waving"}'
      ].join("\n")
    });

    const parsed = await parsePayloadWithRepair(connection, config, messages);

    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.scenes?.map((scene) => String(scene.paragraph)).sort()).toEqual(["1", "P2"]);
    expect(requests).toHaveLength(1);
  });

  test("makes one constrained repair request after malformed JSON", async () => {
    const malformed = '{"scenes": [';
    responses.push(
      { content: malformed },
      { content: '{"scenes":[{"paragraph":1,"camera":"portrait"}]}' }
    );

    const parsed = await parsePayloadWithRepair(connection, config, messages, "user-1");

    expect(parsed).toEqual({ scenes: [{ paragraph: 1, camera: "portrait" }] });
    expect(requests).toHaveLength(2);
    expect(requests[0].messages).toEqual(messages);
    expect(requests[1].messages).toEqual([
      { role: "system", content: "Repair malformed JSON. Return only valid JSON." },
      { role: "user", content: malformed }
    ]);
  });

  test("propagates a parse failure when the single repair response is still unusable", async () => {
    responses.push({ content: "not json" }, { content: "still not json" });

    await expect(parsePayloadWithRepair(connection, config, messages)).rejects.toThrow("Parser did not return usable JSON scenes.");
    expect(requests).toHaveLength(2);
  });

  test("repairs valid but incomplete Static scenes before returning them", async () => {
    const staticConfig = { ...config, perspectiveMode: "static" as const };
    responses.push(
      { content: JSON.stringify({ scenes: [{
        environment: { location: "indoor", timeWeather: "", lightingMood: ["soft lighting"], backgroundElements: [] },
        shots: [{
          paragraph: 1,
          perspectiveMode: "static",
          characters: [{ name: "Mira", composition: { position: "foreground", pose: "holding a simple stable pose", actions: [], gaze: "looking at viewer" } }]
        }]
      }] }) },
      { content: JSON.stringify({ scenes: [{
        environment: {
          location: "school classroom",
          timeWeather: "afternoon",
          lightingMood: ["soft window light"],
          backgroundElements: ["rows of wooden desks", "tall classroom windows"]
        },
        shots: [{
          paragraph: 1,
          perspectiveMode: "static",
          characters: [{
            name: "Mira",
            composition: {
              position: "slightly forward from the background",
              pose: "standing upright with arms relaxed at sides",
              actions: [],
              gaze: "looking at viewer"
            }
          }]
        }]
      }] }) }
    );

    const parsed = await parsePayloadWithRepair(connection, staticConfig, messages);

    expect(requests).toHaveLength(2);
    expect(requests[1].messages[0].content).toContain("Static shot satisfies the listed semantic requirements");
    expect(requests[1].messages[0].content).toContain("specific physical environment.location");
    expect(requests[1].messages[0].content).toContain("2-3 concrete environment.backgroundElements");
    expect(requests[1].messages[0].content).toContain("concrete resting composition.pose");
    expect(parsed.scenes?.[0].environment?.location).toBe("school classroom");
  });

  test("rejects a Static semantic repair that remains incomplete", async () => {
    const staticConfig = { ...config, perspectiveMode: "static" as const };
    const incomplete = JSON.stringify({ scenes: [{
      environment: { location: "indoor", backgroundElements: [] },
      shots: [{ paragraph: 1, characters: [{ composition: { pose: "", actions: [] } }] }]
    }] });
    responses.push({ content: incomplete }, { content: incomplete });

    await expect(parsePayloadWithRepair(connection, staticConfig, messages)).rejects.toThrow(
      "Parser did not return a complete Static scene"
    );
    expect(requests).toHaveLength(2);
  });

  test("logs numeric parser usage without logging response content", async () => {
    responses.push({
      content: '{"scenes":[]}',
      usage: { prompt_tokens: 321, completion_tokens: 45, total_tokens: 366 }
    });

    await parsePayloadWithRepair(connection, { ...config, debugLogging: true }, messages);

    const completionLog = infoLogs.find((message) => message.includes("parser_llm_done")) || "";
    expect(completionLog).toContain('"prompt_tokens":321');
    expect(completionLog).toContain('"total_tokens":366');
    expect(completionLog).not.toContain('{"scenes":[]}');
  });
});

describe("Creative ideation sidecar stage", () => {
  const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "She peers through her fingers." }];
  const context = { systemContext: "", recentContext: "", override: "", diagnostics: {} };

  test("generates and validates a compact candidate slate in one batch call", async () => {
    responses.push({ content: JSON.stringify({ candidates: [
      { paragraph: 1, anchor: "eye gap", concept: "one eye framed by fingers", renderScope: "one red eye and two fingers", camera: "extreme close-up", visibleCues: ["red eye", "fingers"], score: 95 },
      { paragraph: 1, anchor: "rooted feet", concept: "feet fixed against the floor", renderScope: "lower legs and planted feet", camera: "low body-part focus", visibleCues: ["white pantyhose", "shoes"], score: 84 }
    ] }) });

    const concepts = await generateCreativeConcepts(
      connection,
      { ...config, perspectiveMode: "creative" },
      paragraphs,
      "[P1]\nShe peers through her fingers.",
      context
    );

    expect(concepts).toHaveLength(2);
    expect(requests).toHaveLength(1);
    expect(requests[0].messages[0].content).toContain("Creative Illustration Concept Ideator");
    expect(requests[0].messages.at(-1)?.content).toContain("[P1]");
  });

  test("falls back without blocking generation when ideation output is invalid", async () => {
    responses.push({ content: "not a concept slate" });

    const concepts = await generateCreativeConcepts(
      connection,
      { ...config, perspectiveMode: "creative" },
      paragraphs,
      "[P1]\nShe peers through her fingers.",
      context
    );

    expect(concepts).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});
