/**
 * Opt-in live smoke test for the Inlay Illustrator integration driver.
 *
 * Uses the same client module as the MCP server but runs as a plain CLI so a
 * human (or CI with credentials) can verify the flow against a running
 * Lumiverse instance without an MCP client.
 *
 * Run:
 *   LUMIVERSE_URL=http://localhost:7860 LUMIVERSE_USERNAME=... LUMIVERSE_PASSWORD=... \
 *     bun run dev:mcp:smoke [--limit 5] [--turn "Hello!"]
 *
 * Defaults: authenticate -> status -> list characters -> select the first
 * character -> create a test chat -> dry run. With --turn, also sends one
 * full generation turn and waits for Inlay output (up to --inlay-timeout).
 *
 * This command never runs as part of `bun test`.
 */

import { LumiverseClient } from "./client.js";
import type { DebugFn } from "./tools.js";
import {
  inlaySendTestTurn,
  lumiverseCreateTestChat,
  lumiverseDryRun,
  lumiverseListCharacters,
  lumiverseSelectCharacter,
  lumiverseStatus,
  type DriverState
} from "./tools.js";

function usage(): void {
  console.error("Usage: bun run dev:mcp:smoke [--limit N] [--turn TEXT] [--generation-timeout MS] [--inlay-timeout MS]");
  process.exit(2);
}

function parseArgs(argv: string[]): { limit: number; turn?: string; generationTimeout: number; inlayTimeout: number } {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") usage();
    if (flag.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) usage();
      args[flag] = value;
      index += 1;
    }
  }
  const limit = Number(args["--limit"] ?? 5);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) usage();
  const generationTimeout = Number(args["--generation-timeout"] ?? 120_000);
  const inlayTimeout = Number(args["--inlay-timeout"] ?? 300_000);
  return { limit, turn: args["--turn"], generationTimeout, inlayTimeout };
}

async function main(): Promise<void> {
  const { limit, turn, generationTimeout, inlayTimeout } = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.LUMIVERSE_URL || "http://localhost:7860";
  const username = process.env.LUMIVERSE_USERNAME || "";
  const password = process.env.LUMIVERSE_PASSWORD || "";
  if (!username || !password) {
    console.error("LUMIVERSE_USERNAME and LUMIVERSE_PASSWORD must be set (LUMIVERSE_URL defaults to http://localhost:7860).");
    process.exit(2);
  }

  const debug: DebugFn = (message, details) =>
    process.stderr.write(`[smoke] ${message}${details === undefined ? "" : ` ${JSON.stringify(details)}`}\n`);
  const client = new LumiverseClient({ baseUrl, username, password, debug });
  const state: DriverState = { characterId: null, chatId: null };
  const ctx = { client, state, debug, now: () => Date.now() };

  console.log(JSON.stringify(await lumiverseStatus(ctx), null, 2));

  const characters = await lumiverseListCharacters(ctx, { limit });
  console.log(JSON.stringify(characters, null, 2));
  const first = characters.characters[0];
  if (!first) {
    console.error("No characters found; nothing to smoke test.");
    process.exit(1);
  }

  console.log(JSON.stringify(await lumiverseSelectCharacter(ctx, { character_id: first.id }), null, 2));
  console.log(JSON.stringify(await lumiverseCreateTestChat(ctx, { name: "inlay-mcp-smoke" }), null, 2));
  console.log(JSON.stringify(await lumiverseDryRun(ctx, { user_input: "Hello!" }), null, 2));

  if (turn !== undefined) {
    console.log(JSON.stringify(await inlaySendTestTurn(ctx, {
      content: turn,
      generation_timeout_ms: generationTimeout,
      inlay_timeout_ms: inlayTimeout
    }), null, 2));
  }
}

main().catch((error) => {
  console.error(`[smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
