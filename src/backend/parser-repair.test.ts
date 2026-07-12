import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { parsePayloadWithRepair } from "./parser.js";
import type { ParserGenerationRequest } from "./types.js";

type RawRequest = { messages: ParserGenerationRequest["messages"] };

const requests: RawRequest[] = [];
const responses: unknown[] = [];
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
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    generate: {
      raw: async (request: RawRequest) => {
        requests.push(request);
        return responses.shift();
      }
    },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined }
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
});
