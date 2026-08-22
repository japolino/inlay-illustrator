/**
 * Stdio MCP server exposing a lightweight live integration test driver for
 * the Inlay Illustrator Lumiverse extension.
 *
 * Protocol output goes to stdout only (handled by the MCP transport); every
 * diagnostic goes to stderr. Enable diagnostics with LUMIVERSE_MCP_DEBUG=1.
 *
 * Run:  bun run dev:mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LumiverseClient } from "./client.js";
import {
  inlayDescribeConfig,
  inlayGetCharacterTags,
  inlayGetImageDetails,
  inlayGetResult,
  inlayPatchConfig,
  inlayResetConfig,
  inlaySendTestTurn,
  lumiverseCreateTestChat,
  lumiverseDryRun,
  lumiverseGetCharacter,
  lumiverseListCharacters,
  lumiverseSelectCharacter,
  lumiverseStatus,
  type DebugFn,
  type DriverState,
  type ToolContext
} from "./tools.js";

function stderr(message: string): void {
  process.stderr.write(`[lumiverse-mcp] ${message}\n`);
}

function debugEnabled(): boolean {
  const value = process.env.LUMIVERSE_MCP_DEBUG || "";
  return value === "1" || value.toLowerCase() === "true";
}

export function createContext(): ToolContext {
  const baseUrl = process.env.LUMIVERSE_URL || "http://localhost:7860";
  const username = process.env.LUMIVERSE_USERNAME || "";
  const password = process.env.LUMIVERSE_PASSWORD || "";
  const enabled = debugEnabled();
  const debug: DebugFn = (message, details) => {
    if (!enabled) return;
    stderr(`${message}${details === undefined ? "" : ` ${JSON.stringify(details)}`}`);
  };
  const client = new LumiverseClient({ baseUrl, username, password, debug });
  const state: DriverState = { characterId: null, chatId: null };
  return { client, state, debug };
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "lumiverse_status",
    {
      title: "Lumiverse status",
      description:
        "Reports whether the configured Lumiverse instance is reachable, whether authentication succeeded, and which character/chat are currently selected for test-driver state. Never exposes credentials or session tokens.",
      inputSchema: {}
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify(await lumiverseStatus(ctx)) }] })
  );

  server.registerTool(
    "inlay_describe_config",
    {
      title: "Describe Inlay configuration",
      description: "Lists every Inlay Illustrator setting with its current value, default value, type, and allowed enum values. Uses Lumiverse's authenticated extension WebSocket bridge and never exposes credentials.",
      inputSchema: {}
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify(await inlayDescribeConfig(ctx)) }] })
  );

  server.registerTool(
    "inlay_patch_config",
    {
      title: "Patch Inlay configuration",
      description: "Validates and applies a partial Inlay Illustrator configuration patch. Set dry_run=true to preview normalized before/after values without persisting anything.",
      inputSchema: {
        patch: z.record(z.string(), z.unknown()),
        dry_run: z.boolean().optional()
      }
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await inlayPatchConfig(ctx, args)) }] })
  );

  server.registerTool(
    "inlay_reset_config",
    {
      title: "Reset Inlay configuration",
      description: "Resets selected Inlay fields to defaults, or every field with all=true and confirm_all=true.",
      inputSchema: {
        fields: z.array(z.string()).optional(),
        all: z.boolean().optional(),
        confirm_all: z.boolean().optional()
      }
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await inlayResetConfig(ctx, args)) }] })
  );

  server.registerTool(
    "inlay_get_character_tags",
    {
      title: "Get generated character tags",
      description: "Returns Inlay's durable generated character-appearance tags for the selected chat, exactly as shown in the extension's character-memory UI.",
      inputSchema: { chat_id: z.string().optional() }
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await inlayGetCharacterTags(ctx, args)) }] })
  );

  server.registerTool(
    "inlay_get_image_details",
    {
      title: "Get Inlay image prompt tags",
      description: "Returns the stored positive prompt/tags, negative prompt, and perspective details shown when an Inlay-generated image is clicked. Select the image by index, ID, or URL.",
      inputSchema: {
        chat_id: z.string().optional(),
        message_id: z.string().optional(),
        swipe_id: z.number().int().min(0).optional(),
        image_index: z.number().int().min(0).optional(),
        image_id: z.string().optional(),
        image_url: z.string().optional()
      }
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await inlayGetImageDetails(ctx, args)) }] })
  );

  server.registerTool(
    "lumiverse_list_characters",
    {
      title: "List characters",
      description:
        "Lists compact character records (id, name, tags, updated_at, image_id) from Lumiverse's character summary endpoint. Supports search, limit (max 200) and offset.",
      inputSchema: {
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional()
      }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await lumiverseListCharacters(ctx, args)) }]
    })
  );

  server.registerTool(
    "lumiverse_get_character",
    {
      title: "Get character details",
      description:
        "Fetches the full character record via GET /api/v1/characters/:id: system_prompt, description, personality, scenario, first_mes, mes_example, creator_notes, post_history_instructions, alternate_greetings, tags and metadata. Long text fields are truncated (max 10000 chars each) and reported in truncated_fields.",
      inputSchema: { character_id: z.string().min(1) }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await lumiverseGetCharacter(ctx, args)) }]
    })
  );

  server.registerTool(
    "lumiverse_select_character",
    {
      title: "Select character",
      description:
        "Validates that the character exists and stores its ID as the driver's selected character. Test-driver state only; it does not navigate the open Lumiverse browser.",
      inputSchema: { character_id: z.string().min(1) }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await lumiverseSelectCharacter(ctx, args)) }]
    })
  );

  server.registerTool(
    "lumiverse_create_test_chat",
    {
      title: "Create test chat",
      description:
        "Creates a normal Lumiverse chat via POST /api/v1/chats for the selected (or given) character, lets the existing chat route perform normal greeting processing, and stores the new chat ID as the driver's selected chat. Returns the chat plus initial greeting messages.",
      inputSchema: {
        character_id: z.string().optional(),
        name: z.string().optional()
      }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await lumiverseCreateTestChat(ctx, args)) }]
    })
  );

  server.registerTool(
    "lumiverse_dry_run",
    {
      title: "Lumiverse dry run",
      description:
        "Calls POST /api/v1/generate/dry-run and returns the assembled messages, breakdown, model/provider, parameters and token statistics. Tests prompt assembly and Inlay's registered interceptor, but dry run does not emit GENERATION_ENDED and therefore does not execute Inlay's illustration pipeline.",
      inputSchema: {
        chat_id: z.string().optional(),
        user_input: z.string().optional(),
        connection_id: z.string().optional(),
        persona_id: z.string().optional(),
        preset_id: z.string().optional()
      }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await lumiverseDryRun(ctx, args)) }]
    })
  );

  server.registerTool(
    "inlay_send_test_turn",
    {
      title: "Send Inlay test turn",
      description:
        "Full live integration turn: creates a user message (POST /api/v1/chats/:chatId/messages), starts normal generation (POST /api/v1/generate), polls generation status until completion, then continues polling the new assistant message until Inlay Illustrator markup/images appear or the Inlay timeout expires. Dry run never triggers Inlay; only a normal generation emits GENERATION_ENDED.",
      inputSchema: {
        chat_id: z.string().optional(),
        content: z.string().min(1),
        user_name: z.string().optional(),
        connection_id: z.string().optional(),
        persona_id: z.string().optional(),
        preset_id: z.string().optional(),
        generation_timeout_ms: z.number().int().min(1_000).max(600_000).optional(),
        inlay_timeout_ms: z.number().int().min(1_000).max(3_600_000).optional()
      }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await inlaySendTestTurn(ctx, args)) }]
    })
  );

  server.registerTool(
    "inlay_get_result",
    {
      title: "Get Inlay result",
      description:
        "Fetches a stored assistant message (latest by default) and returns the clean narrative text, whether Inlay markup exists, image IDs/URLs, a compact representation of the Inlay blocks, and the Inlay-owned metadata. Never returns large base64 payloads.",
      inputSchema: {
        chat_id: z.string().optional(),
        message_id: z.string().optional()
      }
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await inlayGetResult(ctx, args)) }]
    })
  );
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "inlay-illustrator-lumiverse", version: "0.1.0" });
  registerTools(server, createContext());
  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (debugEnabled()) stderr("MCP server ready; awaiting requests on stdin.");
}

if (import.meta.main) {
  main().catch((error) => {
    stderr(`fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
