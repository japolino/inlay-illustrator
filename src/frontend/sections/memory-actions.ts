import type { FrontendActions } from "../contracts.js";

export type CharacterMemoryMutation =
  | {
      type: "character_tags_update";
      oldName: string;
      name: string;
      tags: string;
    }
  | {
      type: "character_tags_delete";
      name: string;
    };

type CharacterMemoryActions = Pick<
  FrontendActions,
  "activeChatId" | "sendToBackend" | "updateStatus"
>;

export function sendCharacterMemoryMutation(
  actions: CharacterMemoryActions,
  mutation: CharacterMemoryMutation
): void {
  actions.updateStatus(mutation.type === "character_tags_delete"
    ? "Deleting character baseline…"
    : "Saving character baseline…");
  actions.sendToBackend({ ...mutation, chatId: actions.activeChatId() });
}
