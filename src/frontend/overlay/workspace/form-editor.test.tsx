import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { useState } from "preact/hooks";
import type { BasePromptGroups, Gender } from "../../../shared/contract/character.js";
import { BasePromptEditor } from "./form-editor.js";

// Private happy-dom window (other test files install DOM fakes on globalThis).
const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;
afterAll(() => win.happyDOM.abort());
const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(initial: BasePromptGroups, gender: Gender = "female") {
  const changes: BasePromptGroups[] = [];
  function Harness() {
    const [groups, setGroups] = useState(initial);
    return <BasePromptEditor groups={groups} gender={gender} onChange={(next) => (changes.push(next), setGroups(next))} />;
  }
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  render(<Harness />, root as unknown as Element);
  const tab = async (label: string) => {
    const button = [...root.querySelectorAll("nav button")].find((b) => b.textContent === label) as HTMLButtonElement;
    button.click();
    await wait();
  };
  const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.dispatchEvent(new win.Event("focus") as unknown as Event);
    el.value = value;
    el.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    await wait();
    el.dispatchEvent(new win.Event("blur") as unknown as Event);
    await wait();
  };
  return { root, changes, tab, type };
}

describe("base prompt editor", () => {
  test("the Breast tab has Size and Other rows; typing in Other writes body.breast_other (also for male forms)", async () => {
    const { root, changes, tab, type } = mount({ "body.breast_size": ["large breasts"] }, "male");
    await tab("Breast");
    const rows = root.querySelectorAll("[data-base-prompt-fields] > div");
    expect([...rows].map((r) => r.querySelector("span")?.textContent)).toEqual(["Size", "Other"]);
    const other = root.querySelector('input[aria-label="Other"]') as HTMLInputElement;
    expect(other.readOnly).toBeFalsy();
    await type(other, "cleavage, chest tattoo");
    expect(changes.at(-1)!["body.breast_other"]).toEqual(["cleavage", "chest tattoo"]);
  });

  test("the Other tab keeps the typed order after blur and stores otherOrder (regression: AM 0.9.90 other tags order)", async () => {
    const { root, changes, tab, type } = mount({ "body.skin": ["dark skin"], "body.proportions": ["wide hips"] });
    await tab("Other");
    const area = root.querySelector("textarea") as HTMLTextAreaElement;
    expect(area.value).toBe("dark skin, wide hips");
    await type(area, "scar, dark skin, wide hips");
    expect(changes.at(-1)).toMatchObject({ "body.skin": ["dark skin"], "body.proportions": ["wide hips"], custom: ["scar"], otherOrder: ["scar", "dark skin", "wide hips"] });
    expect((root.querySelector("textarea") as HTMLTextAreaElement).value).toBe("scar, dark skin, wide hips");
    await tab("Combined");
    expect((root.querySelector("textarea") as HTMLTextAreaElement).value).toBe("scar, dark skin, wide hips");
  });
});
