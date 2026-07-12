import type { SectionContext } from "./section-context.js";

function createTextInput(ariaLabel: string, value = "", placeholder = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.ariaLabel = ariaLabel;
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

export function renderMemorySection({ ui, characterAppearance, actions }: SectionContext): void {
  const section = ui.section("Character memory", true);
  ui.addSwitch(section, "characterTagContextEnabled", "Use character visual baseline");
  ui.addSubtitle(section, "Current-chat visual baseline");

  const entries = Object.entries(characterAppearance)
    .filter(([name, tags]) => name.trim() && tags.trim())
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [name, tags] of entries) {
    const nameInput = createTextInput("Character name", name);
    ui.row(section, "Character name").append(nameInput);

    const tagsInput = createTextInput("Character appearance tags", tags);
    ui.row(section, "Appearance tags").append(tagsInput);

    const actionTarget = ui.row(section, "");
    actionTarget.classList.add("inlay-actions");
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", () => actions.sendToBackend({
      type: "character_tags_update",
      chatId: actions.activeChatId(),
      oldName: name,
      name: nameInput.value,
      tags: tagsInput.value
    }));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => actions.sendToBackend({
      type: "character_tags_delete",
      chatId: actions.activeChatId(),
      name
    }));
    actionTarget.append(save, remove);
  }

  if (entries.length === 0) {
    ui.addSummary(section, "No character baseline is saved for this chat yet.");
  }

  const newNameInput = createTextInput("New character name", "", "Name");
  ui.row(section, "Character name").append(newNameInput);
  const newTagsInput = createTextInput("New character appearance tags", "", "Appearance tags");
  ui.row(section, "Appearance tags").append(newTagsInput);

  const addTarget = ui.row(section, "");
  addTarget.classList.add("inlay-actions");
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Add character";
  add.addEventListener("click", () => actions.sendToBackend({
    type: "character_tags_update",
    chatId: actions.activeChatId(),
    oldName: "",
    name: newNameInput.value,
    tags: newTagsInput.value
  }));
  addTarget.append(add);
}
