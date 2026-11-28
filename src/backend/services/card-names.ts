/** Names a Lumiverse character card answers to in the story (sources.ts, pipeline group chats). */
import { asRecord, str } from "./util.js";

/**
 * Lumiverse display name of a card (`extensions.alternate_character_name`, "" when unset). Lumiverse writes it as the
 * speaker name of group chat messages and uses it in prompts, so the story text names the character this way.
 */
export function alternateCharacterName(extensions: unknown): string {
  return str(asRecord(extensions).alternate_character_name);
}

/** Card name without trailing decorations ("Alice Liddell || Wonderland" -> "Alice Liddell", "Bob (Knight)" -> "Bob"); "" when nothing is left. */
export function plainCardName(name: unknown): string {
  const head = str(name).split(/[|([{<]/u)[0]!.trim();
  return head.length >= 2 ? head : "";
}
