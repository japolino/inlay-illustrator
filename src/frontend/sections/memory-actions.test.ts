import { describe, expect, test } from "bun:test";
import type { FrontendActions } from "../contracts.js";
import { sendCharacterMemoryMutation } from "./memory-actions.js";

type MutationActions = Pick<
  FrontendActions,
  "activeChatId" | "sendToBackend" | "updateStatus"
>;

function recordingActions(events: unknown[]): MutationActions {
  return {
    activeChatId: () => "chat-1",
    updateStatus: (status) => events.push({ status }),
    sendToBackend: (payload) => events.push({ payload })
  };
}

describe("character-memory mutations", () => {
  test("sets the pending status before sending a chat-scoped save", () => {
    const events: unknown[] = [];

    sendCharacterMemoryMutation(recordingActions(events), {
      type: "character_tags_update",
      oldName: "Alice",
      name: "Alicia",
      tags: "blue eyes"
    });

    expect(events).toEqual([
      { status: "Saving character baseline…" },
      {
        payload: {
          type: "character_tags_update",
          oldName: "Alice",
          name: "Alicia",
          tags: "blue eyes",
          chatId: "chat-1"
        }
      }
    ]);
  });

  test("sets the pending status before sending a chat-scoped delete", () => {
    const events: unknown[] = [];

    sendCharacterMemoryMutation(recordingActions(events), {
      type: "character_tags_delete",
      name: "Alice"
    });

    expect(events).toEqual([
      { status: "Saving character baseline…" },
      {
        payload: {
          type: "character_tags_delete",
          name: "Alice",
          chatId: "chat-1"
        }
      }
    ]);
  });
});
