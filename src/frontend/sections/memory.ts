import type { SectionContext } from "./section-context.js";
import { sendCharacterMemoryMutation } from "./memory-actions.js";

function createTextInput(ariaLabel: string, value = "", placeholder = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.ariaLabel = ariaLabel;
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

function createTagsInput(ariaLabel: string, value = "", placeholder = ""): HTMLTextAreaElement {
  const input = document.createElement("textarea");
  input.ariaLabel = ariaLabel;
  input.value = value;
  input.placeholder = placeholder;
  input.rows = 3;
  return input;
}

export function renderMemorySection({ ui, characterAppearance, actions }: SectionContext): void {
  const entries = Object.entries(characterAppearance)
    .filter(([name, tags]) => name.trim() && tags.trim())
    .sort(([left], [right]) => left.localeCompare(right));
  const section = ui.section("Character memory", false, {
    description: "Review exact visual baselines saved for the active chat.",
    badge: `${entries.length} saved`
  });
  ui.addSwitch(
    section,
    "characterTagContextEnabled",
    "Use visual baselines",
    "Provide these tags to the parser for returning characters. Current narrative changes remain authoritative."
  );

  if (entries.length === 0) {
    ui.addNotice(section, "No visual baseline is saved for this chat yet. Add one below or let a generation discover characters automatically.");
  }

  const list = document.createElement("div");
  list.className = "inlay-memory-list";
  for (const [name, tags] of entries) {
    const card = document.createElement("article");
    card.className = "inlay-memory-card";
    const header = document.createElement("div");
    header.className = "inlay-memory-card-header";
    const nameInput = createTextInput("Character name", name);
    nameInput.className = "inlay-memory-name";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "inlay-icon-button inlay-danger";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${name} visual baseline`);
    remove.addEventListener("click", () => {
      void (async () => {
        const confirmed = await ui.confirmDestructive(
          "Delete character baseline?",
          `Delete the saved visual baseline for "${name}"? This cannot be undone.`,
          "Delete baseline"
        );
        if (!confirmed) return;
        sendCharacterMemoryMutation(actions, {
          type: "character_tags_delete",
          name
        });
      })();
    });
    header.append(nameInput, remove);

    const label = document.createElement("label");
    label.className = "inlay-memory-field";
    const labelText = document.createElement("span");
    labelText.textContent = "Appearance tags";
    const tagsInput = createTagsInput("Character appearance tags", tags, "hair, eyes, body, attire");
    label.append(labelText, tagsInput);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "inlay-memory-save";
    save.textContent = "Save changes";
    save.addEventListener("click", () => {
      if (!nameInput.value.trim() || !tagsInput.value.trim()) {
        actions.updateStatus("Character name and appearance tags are required.");
        return;
      }
      sendCharacterMemoryMutation(actions, {
        type: "character_tags_update",
        oldName: name,
        name: nameInput.value,
        tags: tagsInput.value
      });
    });
    card.append(header, label, save);
    list.append(card);
  }
  section.append(list);

  const addCard = document.createElement("article");
  addCard.className = "inlay-memory-card inlay-memory-card-new";
  const addTitle = document.createElement("div");
  addTitle.className = "inlay-subtitle";
  addTitle.textContent = "Add a character";
  const newNameInput = createTextInput("New character name", "", "Character name");
  const newTagsInput = createTagsInput("New character appearance tags", "", "hair, eyes, body, attire");
  const add = document.createElement("button");
  add.type = "button";
  add.className = "inlay-primary";
  add.textContent = "Add baseline";
  add.addEventListener("click", () => {
    if (!newNameInput.value.trim() || !newTagsInput.value.trim()) {
      actions.updateStatus("Character name and appearance tags are required.");
      return;
    }
    sendCharacterMemoryMutation(actions, {
      type: "character_tags_update",
      oldName: "",
      name: newNameInput.value,
      tags: newTagsInput.value
    });
  });
  addCard.append(addTitle, newNameInput, newTagsInput, add);
  section.append(addCard);
}
