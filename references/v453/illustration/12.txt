Your ultimate task: Update the last data block according to user direction and action. Keep new data consistent with the general guidelines and universe settings.

Action specifies what to do and which data to interact with. Other data are out of scope.

## Patch Operations

### RegenerateScene

How to regenerate a scene: Read `Slot:N` and `Index:K` from `RegenerateScene/ChatIndex:I/Slot:N/Index:K`. Depict a complete moment established before `<slot num="N"/>`. Use prose after the slot only to preserve continuity, not to introduce an action, interaction, or reaction that has not occurred before the slot.

Rebuild the complete descriptor for the moment at `<slot num="N"/>` from the narrative context. Preserve established character identity, appearance, attire, and environment continuity. Ignore the requested Scene count and Key Visual instructions. Follow every active Scene, composition, character, comic-mode, client-comment, and output-language rule from the main guideline.

Replace the scene at `/scenes/{K}` with the newly generated scene descriptor, using `Index:K` from the action. Keep `slot` set to N.

### DirectScene

How to direct: Update, add, or remove Scenes and Key Visual according to the user direction.

- Adding scenes:
  Locate an unused `<slot num="N"/>` insertion point in the chat log corresponding to the requested narrative moment. Build a complete scene descriptor depicting that moment. Append the new scene object to `/scenes/-` with its `slot` set to the chosen slot number N.
- Modifying or removing scenes:
  Replace the corresponding scene at `/scenes/{index}` or specific fields within it. Keep its `slot` number unchanged unless relocating.
- Removing scenes:
  Remove the corresponding scene at `/scenes/{index}`.
- Adding or modifying Key Visual:
  Add, update, or replace `/keyvis`.

Express each change as the smallest practical set of patch operations. Keep untouched scenes and fields out of the patch.

### Output

For interaction requests, ignore the normal-generation `<lb-xnai>` output format. Output only a JSON Patch array wrapped in `<lb-xnai-patch>`, without a complete `<lb-xnai>` block. Apply the patch rules below.

The patch target is the object below, decoded from the last `<lb-xnai>` data block:

```json
{
  "keyvis": {
    "camera": "close-up",
    "cast": "solo",
    "characters": [
      {
        "description": "standing straight",
        "name": "character name",
        "negative": "low quality",
        "positive": "1girl, smile"
      }
    ],
    "scene": "in a sunlit garden"
  },
  "scenes": [{{#when::lb-xnai.scene.comic::tisnot::0}}
    {
      "cast": "solo",
      "panels": [
        {
          "characters": [
            {
              "description": "looking forward",
              "name": "character name",
              "negative": "low quality",
              "positive": "1girl, smile"
            }
          ],
          "scene": "first panel setting"
        }
      ],
      "slot": 0
    }
{{:else}}
    {
      "camera": "cowboy shot",
      "cast": "solo",
      "characters": [
        {
          "description": "looking forward",
          "name": "character name",
          "negative": "low quality",
          "positive": "1girl, smile"
        }
      ],
      "scene": "sitting on a bench",
      "slot": 0
    }{{/when}}
  ]
}
```

- Use only `add`, `remove`, and `replace` operations.
- Use JSON Pointer paths with zero-based array indices.
- For appending a scene, use `/scenes/-`.
- Apply operations in array order and write each path against the result of preceding operations.
- Keep the root object structure.
- Include only operations required by the interaction. Keep untouched values out of the patch.
- Write strict JSON with double-quoted keys and strings without Markdown fences.
- Encode every line break in a JSON string as `\u000A`. Do not use `\n` or a literal line break inside a string.
- Every scene object must contain a valid `slot` number matching an available `<slot num="N"/>` position in the chat log.

Example patch for updating specific fields in an existing scene:

```
<lb-xnai-patch>
[
{{#when::lb-xnai.scene.comic::tisnot::0}}  {
    "op": "replace",
    "path": "/scenes/0/panels/0/characters/0/positive",
    "value": "1girl, gentle smile, white sundress"
  }
{{:else}}  {
    "op": "replace",
    "path": "/scenes/0/camera",
    "value": "close-up"
  },
  {
    "op": "replace",
    "path": "/scenes/0/characters/0/positive",
    "value": "1girl, gentle smile, white sundress"
  }
{{/when}}]
</lb-xnai-patch>
```

Example patch for adding a new scene:

```
<lb-xnai-patch>
[
  {
    "op": "add",
    "path": "/scenes/-",
    "value": {{#when::lb-xnai.scene.comic::tisnot::0}}{
      "cast": "solo",
      "panels": [
        {
          "characters": [
            {
              "description": "sitting quietly with folded hands",
              "name": "character name",
              "negative": "",
              "positive": "1girl, gentle smile"
            }
          ],
          "scene": "by the library window"
        }
      ],
      "slot": 2
    }{{:else}}{
      "camera": "medium shot",
      "cast": "solo",
      "characters": [
        {
          "description": "sitting quietly with folded hands",
          "name": "character name",
          "negative": "",
          "positive": "1girl, gentle smile"
        }
      ],
      "scene": "by the library window",
      "slot": 2
    }{{/when}}
  }
]
</lb-xnai-patch>
```
