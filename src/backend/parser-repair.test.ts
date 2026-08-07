import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { generateCreativeConcepts, parsePayloadWithRepair, parserStageTokenBudget, repairDynamicCameraDiversity } from "./parser.js";
import type { ParserGenerationRequest } from "./types.js";

type RawRequest = { messages: ParserGenerationRequest["messages"]; parameters?: Record<string, unknown>; signal?: AbortSignal };

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

describe("parser output budgets", () => {
  test("reserves completion space for reasoning-heavy models and supports a configured override", () => {
    const singleImage = { ...DEFAULT_CONFIG, maxImages: 1 };
    expect(parserStageTokenBudget("DeepSeek-A/deepseek-v4-pro", singleImage, "main")).toBe(9000);
    expect(parserStageTokenBudget("DeepSeek-A/deepseek-v4-pro", singleImage, "repair")).toBe(7000);
    expect(parserStageTokenBudget("Gemini/gcli-gemini-3.1-pro-preview", singleImage, "main")).toBe(2700);
    expect(parserStageTokenBudget("CODEX/gpt-5.6-luna", singleImage, "main")).toBe(2700);
    expect(parserStageTokenBudget("CODEX/gpt-5.6-luna", { ...singleImage, coverImageEnabled: true }, "main")).toBe(3600);
    expect(parserStageTokenBudget("AROMA/claude-sonnet-5", singleImage, "main")).toBe(9000);
    expect(parserStageTokenBudget("AROMA/claude-sonnet-5", singleImage, "repair")).toBe(7000);
    expect(parserStageTokenBudget("Moonshot/kimi-k2.7-code-highspeed", singleImage, "main")).toBe(16000);
    expect(parserStageTokenBudget("Moonshot/kimi-k2.7-code-highspeed", singleImage, "repair")).toBe(12000);
    expect(parserStageTokenBudget("Moonshot/kimi-k2.7-code-highspeed", singleImage, "ideation")).toBe(8000);
    const explicitBudget = { ...singleImage, parserMaxTokens: 12_000 };
    expect(parserStageTokenBudget("Moonshot/kimi-k2.7-code-highspeed", explicitBudget, "main")).toBe(12_000);
    expect(parserStageTokenBudget("Moonshot/kimi-k2.7-code-highspeed", explicitBudget, "ideation")).toBe(12_000);
  });
});

describe("parser JSON recovery", () => {
  test("forwards cooperative cancellation into an active parser request", async () => {
    let providerSignal: AbortSignal | undefined;
    (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
      generate: {
        raw: (request: RawRequest) => new Promise((_resolve, reject) => {
          providerSignal = request.signal;
          request.signal?.addEventListener("abort", () => {
            const error = new Error("provider aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        })
      },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined }
    };
    const controller = new AbortController();
    const parsing = parsePayloadWithRepair(connection, config, messages, undefined, controller.signal);
    await Promise.resolve();
    controller.abort("test cancellation");

    await expect(parsing).rejects.toHaveProperty("name", "AbortError");
    expect(providerSignal?.aborted).toBe(true);
  });

  test("removes exact duplicate character objects within one shot", async () => {
    const duplicate = { name: "Rhea Calder", label: "girl", appearance: "long white braid" };
    responses.push({ content: JSON.stringify({ scenes: [{ shots: [{ paragraph: 1, characters: [duplicate, duplicate] }] }] }) });

    const parsed = await parsePayloadWithRepair(connection, config, [{
      role: "user",
      content: "## Current Numbered Paragraph Source\n[P1]\nRhea waits."
    }]);

    expect(parsed.scenes?.[0].shots?.[0].characters).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(parsed.scenes?.[0], "characters")).toBe(false);
  });

  test("normalizes subject-facing camera language and closed-eye expression out of composition", async () => {
    responses.push({ content: JSON.stringify({
      scenes: [{
        shots: [{
          paragraph: 1,
          characters: [{
            name: "Nyra Vale",
            composition: {
              position: "reclining toward camera",
              pose: "legs angled toward camera",
              actions: ["reaching past camera"],
              gaze: "eyes closed in pleasure"
            }
          }]
        }]
      }]
    }) });

    const parsed = await parsePayloadWithRepair(connection, config, [{
      role: "user",
      content: "## Current Numbered Paragraph Source\n[P1]\nNyra reclines."
    }]);

    expect(parsed.scenes?.[0].shots?.[0].characters?.[0].composition).toEqual({
      position: "reclining toward viewer",
      pose: "legs angled toward viewer",
      actions: ["reaching past viewer"],
      gaze: ""
    });
  });

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
    expect(requests[0].parameters?.response_format).toEqual({ type: "json_object" });
    expect(requests[0].parameters?.max_tokens).toBeGreaterThan(0);
  });

  test("retries once without structured output when a compatible proxy rejects the parameter", async () => {
    const unsupportedConnection = { ...connection, provider: "custom", model: "gemini-unsupported-test" };
    const unsupportedConfig = { ...config, parserModel: "" };
    responses.push(
      Promise.reject(new Error("400 invalid response_format argument")),
      { content: '{"scenes":[{"paragraph":1,"camera":"portrait"}]}' }
    );

    const parsed = await parsePayloadWithRepair(unsupportedConnection, unsupportedConfig, messages);

    expect(parsed.scenes).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests[0].parameters?.response_format).toEqual({ type: "json_object" });
    expect(requests[1].parameters?.response_format).toBeUndefined();
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

  test("infers an omitted shot paragraph when Adaptive parsing exposes one source paragraph", async () => {
    responses.push({ content: JSON.stringify({
      scenes: [{
        environment: { location: "garden" },
        shots: [{ perspectiveMode: "creative", camera: { framing: "body-part focus" }, characters: [] }]
      }]
    }) });
    const adaptiveMessages: ParserGenerationRequest["messages"] = [{
      role: "user",
      content: [
        "Create the requested image-prompt batch.",
        "## Current Numbered Paragraph Source",
        "[P5]\nShe peers through her fingers.",
        "## Selected Creative Concepts",
        "[P5] concept ID: creative-example"
      ].join("\n\n")
    }];

    const parsed = await parsePayloadWithRepair(connection, { ...config, adaptiveMode: true }, adaptiveMessages);

    expect(parsed.scenes?.[0].shots?.[0].paragraph).toBe(5);
    expect(requests).toHaveLength(1);
  });

  test("inherits a scene-level paragraph into nested shots", async () => {
    responses.push({ content: JSON.stringify({
      scenes: [{ paragraph: "P5", environment: { location: "garden" }, shots: [{ camera: "close-up" }] }]
    }) });
    const numberedMessages: ParserGenerationRequest["messages"] = [{
      role: "user",
      content: "## Current Numbered Paragraph Source\n\n[P2]\nFirst beat.\n\n[P5]\nSecond beat."
    }];

    const parsed = await parsePayloadWithRepair(connection, config, numberedMessages);

    expect(parsed.scenes?.[0].shots?.[0].paragraph).toBe(5);
    expect(requests).toHaveLength(1);
  });

  test("repairs structurally valid JSON with no usable numbered shots", async () => {
    responses.push(
      { content: '{"scenes":[{"shots":[{"camera":"close-up"}]}]}' },
      { content: '{"scenes":[{"shots":[{"paragraph":2,"camera":"close-up"}]}]}' }
    );
    const numberedMessages: ParserGenerationRequest["messages"] = [{
      role: "user",
      content: "## Current Numbered Paragraph Source\n\n[P2]\nFirst beat.\n\n[P5]\nSecond beat."
    }];

    const parsed = await parsePayloadWithRepair(connection, config, numberedMessages);

    expect(parsed.scenes?.[0].shots?.[0].paragraph).toBe(2);
    expect(requests).toHaveLength(2);
    expect(requests[1].messages[0].content).toContain("Allowed paragraph references: P2, P5");
    expect(requests[1].messages[1].content).not.toBe("");
  });

  test("keeps the full source for terminal state while allowing shots only for routed paragraphs", async () => {
    const routedMessages: ParserGenerationRequest["messages"] = [{
      role: "system",
      content: "Production parser contract.\n\n## Terminal Visual State\nterminalState is required."
    }, {
      role: "user",
      content: [
        "## Current Numbered Paragraph Source",
        "[P1]\nThe pair argues on a residential road.",
        "",
        "[P2]\nThey enter an apartment living room.",
        "",
        "## Non-authoritative Shot-Router Notes",
        "[P1]: Visual thesis: tense roadside argument; Camera intent: medium side view"
      ].join("\n")
    }];
    const initial = {
      scenes: [{
        environment: { location: "residential road" },
        shots: [{ paragraph: 1 }, { paragraph: 2 }]
      }]
    };
    const repaired = {
      scenes: [{
        environment: { location: "residential road" },
        shots: [{ paragraph: 1 }]
      }],
      terminalState: {
        paragraph: 2,
        environment: {
          location: "apartment living room",
          timeWeather: "evening",
          lightingMood: ["soft ceiling light"],
          backgroundElements: ["fabric sofa"]
        },
        environmentChanges: ["location", "lightingMood", "backgroundElements"],
        characters: []
      }
    };
    responses.push({ content: JSON.stringify(initial) }, { content: JSON.stringify(repaired) });

    const parsed = await parsePayloadWithRepair(connection, config, routedMessages);

    expect(requests).toHaveLength(2);
    expect(requests[1].messages[0].content).toContain("allowed references are P1");
    expect(requests[1].messages[0].content).toContain("terminalState.paragraph");
    expect(requests[1].messages[1].content).toContain("They enter an apartment living room.");
    expect(parsed.scenes?.[0].shots).toHaveLength(1);
    expect(parsed.terminalState).toMatchObject({
      paragraph: 2,
      environment: { location: "apartment living room" }
    });
  });

  test("rejects an empty provider response without sending an invalid empty repair request", async () => {
    responses.push({ content: "" });

    await expect(parsePayloadWithRepair(connection, config, messages)).rejects.toThrow("Parser returned an empty response.");
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
      "Parser did not return a complete payload"
    );
    expect(requests).toHaveLength(2);
  });

  test("repairs a Dynamic response that omits its compact rendering projection", async () => {
    const dynamicMessages: ParserGenerationRequest["messages"] = [{
      role: "system",
      content: "Dynamic shots require shotPlan.primaryAction plus renderScope and visibleTags."
    }, {
      role: "user",
      content: "## Current Numbered Paragraph Source\n[P1]\nA woman pulls a man left through a train corridor."
    }];
    const incomplete = {
      scenes: [{
        environment: {
          location: "inside train corridor",
          timeWeather: "rainy evening",
          lightingMood: ["cold window light"],
          backgroundElements: ["closing doorway"]
        },
        shots: [{
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: { framing: "medium shot", angle: "eye level", perspective: "from side", focus: ["motion blur"] },
          situation: "1girl, 1boy",
          characters: [{
            name: "woman",
            label: "girl",
            appearance: "long white braid",
            attire: "navy coat",
            composition: { position: "left side", pose: "running", actions: ["pulling the man left"], gaze: "looking forward" }
          }]
        }]
      }]
    };
    responses.push({ content: JSON.stringify(incomplete) });

    const parsed = await parsePayloadWithRepair(connection, config, dynamicMessages);

    // The deterministic local repair now resolves the omission in the main
    // pass, so no LLM repair round trip is needed.
    expect(requests).toHaveLength(1);
    const shot = parsed.scenes?.[0].shots?.[0];
    expect(shot?.shotPlan).toMatchObject({ primaryAction: "pulling the man left" });
    expect(shot?.characters?.[0]).toMatchObject({
      renderScope: "upper body visible",
      visibleTags: "long white braid, navy coat"
    });
  });

  test("locally repairs a Dynamic response that omits visibleTags and writes multi-clause shotPlan phrases", async () => {
    const dynamicMessages: ParserGenerationRequest["messages"] = [{
      role: "system",
      content: "Dynamic shots require shotPlan.primaryAction plus renderScope and visibleTags."
    }, {
      role: "user",
      content: "## Current Numbered Paragraph Source\n[P1]\nA woman pulls a man left through a train corridor."
    }];
    const incomplete = {
      scenes: [{
        environment: {
          location: "inside train corridor",
          timeWeather: "rainy evening",
          lightingMood: ["cold window light"],
          backgroundElements: ["closing doorway"]
        },
        shots: [{
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: { framing: "medium shot", angle: "eye level", perspective: "from side", focus: [] },
          shotPlan: {
            primaryAction: "woman pulls man left",
            secondaryCue: "",
            staging: "woman leads beside the window, man follows behind"
          },
          situation: "1girl, 1boy",
          characters: [{
            name: "woman",
            label: "girl",
            appearance: "long white braid",
            body: "tall",
            attire: "navy coat, black skirt",
            renderScope: "upper body visible",
            composition: { position: "left side", pose: "running", actions: ["pulling the man left"], gaze: "looking forward" }
          }, {
            name: "man",
            label: "boy",
            appearance: "short black hair",
            attire: "gray jacket",
            renderScope: "upper body visible",
            composition: { position: "right side", pose: "stumbling", actions: [], gaze: "looking forward" }
          }]
        }]
      }]
    };
    responses.push({ content: JSON.stringify(incomplete) });

    const parsed = await parsePayloadWithRepair(connection, config, dynamicMessages);

    // The deterministic local repair resolves everything: no LLM repair round trip.
    expect(requests).toHaveLength(1);
    const shot = parsed.scenes?.[0].shots?.[0];
    expect(shot?.shotPlan).toMatchObject({ staging: "woman leads beside the window" });
    expect(shot?.characters?.[0]).toMatchObject({
      visibleTags: "long white braid, navy coat",
      renderScope: "upper body visible"
    });
    expect(shot?.characters?.[1]).toMatchObject({
      visibleTags: "short black hair, gray jacket",
      renderScope: "upper body visible"
    });
    // Projection must respect the framing: hips/legs attire never leaks into a medium shot.
    expect(shot?.characters?.[0]?.visibleTags).not.toContain("skirt");
  });

  test("locally repairs the LLM repair response when it still omits visibleTags", async () => {
    const dynamicMessages: ParserGenerationRequest["messages"] = [{
      role: "system",
      content: "Dynamic shots require shotPlan.primaryAction plus renderScope and visibleTags."
    }, {
      role: "user",
      content: "## Current Numbered Paragraph Source\n[P1]\nA woman pulls a man left through a train corridor."
    }];
    const broken = {
      scenes: [{
        environment: {
          location: "inside train corridor",
          timeWeather: "rainy evening",
          lightingMood: ["cold window light"],
          backgroundElements: ["closing doorway"]
        },
        shots: [{
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: { framing: "medium shot", angle: "eye level", perspective: "from side", focus: [] },
          shotPlan: { primaryAction: "", secondaryCue: "", staging: "woman leads beside the window, man follows behind" },
          situation: "1girl, 1boy",
          characters: [{
            name: "woman",
            label: "girl",
            appearance: "long white braid",
            attire: "navy coat",
            composition: { position: "left side", pose: "running", actions: [], gaze: "looking forward" }
          }]
        }]
      }]
    };
    // Main call still fails after the local pass because primaryAction has no
    // local source; the LLM repair adds primaryAction but again omits
    // visibleTags, which the local pass then synthesizes.
    const repairedByModel = structuredClone(broken);
    repairedByModel.scenes[0].shots[0].shotPlan.primaryAction = "woman pulls man left";
    responses.push({ content: JSON.stringify(broken) }, { content: JSON.stringify(repairedByModel) });

    const parsed = await parsePayloadWithRepair(connection, config, dynamicMessages);

    expect(requests).toHaveLength(2);
    const shot = parsed.scenes?.[0].shots?.[0];
    expect(shot?.shotPlan).toMatchObject({ primaryAction: "woman pulls man left", staging: "woman leads beside the window" });
    expect(shot?.characters?.[0]).toMatchObject({
      renderScope: "upper body visible",
      visibleTags: "long white braid, navy coat"
    });
  });

  test("accepts fragment framings whose characters omit renderScope and visibleTags", async () => {
    const dynamicMessages: ParserGenerationRequest["messages"] = [{
      role: "system",
      content: "Dynamic shots require shotPlan.primaryAction plus renderScope and visibleTags."
    }, {
      role: "user",
      content: "## Current Numbered Paragraph Source\n[P1]\nHer hand reaches out."
    }];
    responses.push({ content: JSON.stringify({
      scenes: [{
        environment: {
          location: "inside train corridor",
          timeWeather: "rainy evening",
          lightingMood: ["cold window light"],
          backgroundElements: ["closing doorway"]
        },
        shots: [{
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] },
          shotPlan: { primaryAction: "hand reaches out", secondaryCue: "", staging: "hand extends" },
          situation: "1girl",
          characters: [{
            name: "woman",
            label: "girl",
            appearance: "long white braid",
            attire: "navy coat",
            composition: { position: "left", pose: "reaching", actions: [], gaze: "" }
          }]
        }]
      }]
    }) });

    const parsed = await parsePayloadWithRepair(connection, config, dynamicMessages);

    expect(requests).toHaveLength(1);
    // The renderer fails closed for fragment framings; the parser must not block generation.
    expect(parsed.scenes?.[0].shots?.[0].characters?.[0]).not.toHaveProperty("visibleTags");
  });

  test("logs numeric parser usage without logging response content", async () => {
    responses.push({
      content: '{"scenes":[{"paragraph":1,"camera":"portrait"}]}',
      usage: {
        prompt_tokens: 321,
        completion_tokens: 45,
        total_tokens: 366,
        prompt_tokens_details: { cached_tokens: 256 }
      }
    });

    await parsePayloadWithRepair(connection, { ...config, debugLogging: true }, messages);

    const completionLog = infoLogs.find((message) => message.includes("parser_llm_done")) || "";
    expect(completionLog).toContain('"prompt_tokens":321');
    expect(completionLog).toContain('"total_tokens":366');
    expect(completionLog).toContain('"cached_tokens":256');
    expect(completionLog).not.toContain('"camera":"portrait"');
  });
});

describe("Creative ideation sidecar stage", () => {
  const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "She peers through her fingers." }];
  const context = { systemContext: "", recentContext: "", override: "", diagnostics: {} };

  test("generates and validates a compact candidate slate in one batch call", async () => {
    responses.push({ content: JSON.stringify({ candidates: [
      { paragraph: 1, subjectType: "shadow", anchor: "finger shadow", concept: "interlaced finger shadows cross the wall", renderScope: "shadow geometry and blank wall", camera: "tight oblique detail", visibleCues: ["interlaced shadows", "wall"], score: 95 },
      { paragraph: 1, subjectType: "fragment", anchor: "fingertips", concept: "fingertips hover at the edge of frame", renderScope: "fingertips and empty negative space", camera: "macro side detail", visibleCues: ["fingertips", "negative space"], score: 84 }
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

describe("camera diversity repair stage", () => {
  test("preserves projected Dynamic cameras so crop-visible tags remain aligned", async () => {
    const projectedPayload = {
      scenes: [{ shots: [
        {
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] },
          shotPlan: { primaryAction: "Rhea points toward the train", secondaryCue: "", staging: "Rhea stands beside Evan" },
          renderScope: "Rhea from the waist up",
          visibleTags: ["long white braid", "navy officer coat"]
        },
        {
          paragraph: 2,
          perspectiveMode: "dynamic",
          camera: { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] },
          shotPlan: { primaryAction: "Evan pulls Rhea forward", secondaryCue: "", staging: "Evan runs ahead of Rhea" },
          renderScope: "Evan and Rhea from the waist up",
          visibleTags: ["messy short black hair", "long white braid"]
        }
      ] }]
    };

    const repaired = await repairDynamicCameraDiversity(
      connection,
      { ...config, adaptiveMode: true },
      projectedPayload,
      "[P1]\nFirst beat.\n\n[P2]\nSecond beat."
    );

    expect(repaired).toBe(projectedPayload);
    expect(requests).toHaveLength(0);
  });

  test("repairs exact Dynamic camera collisions locally before using the provider", async () => {
    const duplicatePayload = {
      scenes: [{ shots: [
        { paragraph: 1, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] }, action: "first" },
        { paragraph: 2, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] }, action: "second" }
      ] }]
    };
    const repaired = await repairDynamicCameraDiversity(
      connection,
      { ...config, adaptiveMode: true },
      duplicatePayload,
      "[P1]\nFirst beat.\n\n[P2]\nSecond beat."
    );

    expect(requests).toHaveLength(0);
    expect(repaired.scenes?.[0].shots?.[0].action).toBe("first");
    expect(repaired.scenes?.[0].shots?.[1].camera).toMatchObject({
      angle: "eye level",
      perspective: "three-quarter view"
    });
    expect((repaired.scenes?.[0].shots?.[1].camera as { framing?: string } | undefined)?.framing).not.toBe("close-up");
  });

  test("fails open when the targeted repair provider errors", async () => {
    const original = {
      scenes: [{ shots: [
        { paragraph: 1, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level" } },
        { paragraph: 2, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level" } }
      ] }]
    };
    responses.push(Promise.reject(new Error("proxy timeout")));

    const repaired = await repairDynamicCameraDiversity(connection, { ...config, adaptiveMode: true }, original, "[P1]\nOne\n\n[P2]\nTwo");

    expect(repaired).toBe(original);
    expect(requests).toHaveLength(1);
  });
});


describe("Fast Mode parser budgets", () => {
  test("caps the main and repair budgets below the normal per-image formula", () => {
    const normal = { ...DEFAULT_CONFIG, maxImages: 5 };
    const fast = { ...DEFAULT_CONFIG, fastMode: true, maxImages: 5 };
    expect(parserStageTokenBudget("base-model", normal, "main")).toBe(6300);
    expect(parserStageTokenBudget("base-model", fast, "main")).toBe(4400);
    expect(parserStageTokenBudget("base-model", normal, "repair")).toBe(5600);
    expect(parserStageTokenBudget("base-model", fast, "repair")).toBe(4400);
  });

  test("keeps the configured parserMaxTokens as an upper bound in Fast Mode", () => {
    const fast = { ...DEFAULT_CONFIG, fastMode: true, maxImages: 5, parserMaxTokens: 3000 };
    expect(parserStageTokenBudget("base-model", fast, "main")).toBe(3000);
  });

  test("caps stages that should not normally run in Fast Mode", () => {
    const fast = { ...DEFAULT_CONFIG, fastMode: true, maxImages: 5 };
    expect(parserStageTokenBudget("base-model", fast, "ideation")).toBe(2400);
    expect(parserStageTokenBudget("base-model", fast, "preprocess")).toBe(2400);
    expect(parserStageTokenBudget("base-model", fast, "camera")).toBe(1800);
  });

  test("keeps a strict reduction even at large image counts", () => {
    const normal = { ...DEFAULT_CONFIG, maxImages: 12 };
    const fast = { ...DEFAULT_CONFIG, fastMode: true, maxImages: 12 };
    expect(parserStageTokenBudget("base-model", normal, "main")).toBe(7000);
    expect(parserStageTokenBudget("base-model", fast, "main")).toBe(5200);
    expect(parserStageTokenBudget("base-model", normal, "repair")).toBe(6000);
    expect(parserStageTokenBudget("base-model", fast, "repair")).toBe(5200);
  });

  test("keeps the normal main/repair budget for reasoning-heavy models in Fast Mode", () => {
    // Output truncation forces repair or failure for these models, which is
    // slower than the saved output tokens; their Fast Mode win is stage
    // skipping and compact input, not output caps.
    const fast = { ...DEFAULT_CONFIG, fastMode: true, maxImages: 1 };
    expect(parserStageTokenBudget("DeepSeek-A/deepseek-v4-pro", fast, "main")).toBe(9000);
    expect(parserStageTokenBudget("Moonshot/kimi-k2.7-code-highspeed", fast, "main")).toBe(16000);
    expect(parserStageTokenBudget("AROMA/claude-sonnet-5", fast, "repair")).toBe(7000);
    expect(parserStageTokenBudget("DeepSeek-A/deepseek-v4-pro", fast, "ideation")).toBe(2400);
    expect(parserStageTokenBudget("AROMA/claude-sonnet-5", fast, "camera")).toBe(2400);
  });

  test("non-reasoning models keep the tight Fast budget formula", () => {
    const fast = { ...DEFAULT_CONFIG, fastMode: true, maxImages: 1 };
    expect(parserStageTokenBudget("base-model", fast, "main")).toBe(2000);
  });
});

describe("Fast Mode camera diversity", () => {
  test("never invokes the remote repair LLM and preserves the original payload when local repair cannot resolve collisions", async () => {
    const original = {
      scenes: [{ shots: [
        { paragraph: 1, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level" } },
        { paragraph: 2, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level" } }
      ] }]
    };

    const repaired = await repairDynamicCameraDiversity(
      connection,
      { ...config, fastMode: true, adaptiveMode: true },
      original,
      "[P1]\nOne\n\n[P2]\nTwo"
    );

    expect(repaired).toBe(original);
    expect(requests).toHaveLength(0);
  });

  test("still applies the local camera repair in Fast Mode when it can resolve collisions", async () => {
    const duplicatePayload = {
      scenes: [{ shots: [
        { paragraph: 1, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] }, action: "first" },
        { paragraph: 2, perspectiveMode: "dynamic", camera: { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] }, action: "second" }
      ] }]
    };
    const repaired = await repairDynamicCameraDiversity(
      connection,
      { ...config, fastMode: true, adaptiveMode: true },
      duplicatePayload,
      "[P1]\nFirst beat.\n\n[P2]\nSecond beat."
    );

    expect(requests).toHaveLength(0);
    expect((repaired.scenes?.[0].shots?.[1].camera as { framing?: string } | undefined)?.framing).not.toBe("close-up");
  });
});
