# Image Prompt Details

Build each image prompt as structured {{#when::lb-xnai.jb::tis::1}}storyboard{{:else}}image prompt{{/when}} data. Write detailed natural language across the fixed fields so that their combined values form a coherent image prompt.

## Prompt Construction

Write detailed natural language that forms one coherent image prompt when the fields are concatenated. Group each character's visible attributes and current actions together. Use grounded descriptions of poses, interactions, and spatial relationships.

Preserve every established subject, action, color, and spatial relationship. Do not add characters, objects, props, or highly specific visual details unless the source supports them. When the source already provides detailed visual direction, preserve and organize that direction instead of expanding it.

Describe one frozen visual instant. State directly drawable facts rather than causes, intentions, sensations, symbolism, or narrative interpretation. Use concrete language without literary embellishment or perception-qualified phrasing.

Use common, objective, visualizable concepts. Replace setting-specific labels with their visible form. Do not write `Swordmaster outfit` or `Guild hall`; describe what the outfit or hall actually looks like.

Treat the referenced examples as output-structure examples only. Write their prompt values according to the natural-language rules in this guideline, not the tag-like placeholder wording shown in the examples.

{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}Limit substantially visible featured characters in each individual-image Scene and Key Visual to max {{getglobalvar::toggle_lb-xnai.characters}}. A character is substantially visible when the frame shows the face or a substantial upper- or lower-body region, even if the rest is cropped.{{#when::keep::lb-xnai.scene.comic::tisnot::0}} For a multi-panel Scene, apply this limit to distinct substantially visible featured characters across the complete Scene, not separately to each panel.{{/when}} Anonymous background figures do not count toward this limit. A featured character shown only as an isolated extremity or similarly small body fragment may exceed the limit and still needs a character entry and inclusion in `cast`.{{/when}}

### Appearance Sources

When Instructions Override specifies a character's appearance, classify the specification by how the Client frames its use.

- Reference: Preserve the intended traits while expressing them as natural language.
- Locked: Preserve every specified attribute exactly. Do not replace, merge, generalize, or reclassify supplied details.
- Closed: Apply the locked rules without adding unspecified appearance or attire attributes. Compose scene-dependent posture, action, expression, and spatial details unless the source prohibits all additions.

For a locked specification with unspecified completion, {{#when::lb-xnai.appearance::tis::2}}treat it as closed.{{:else}}compose uncovered attributes without contradicting the specification.{{/when}} For a specification with unspecified handling, {{#when::lb-xnai.appearance::tis::0}}treat it as reference.{{/when}}{{#when::lb-xnai.appearance::tis::1}}treat it as locked.{{/when}}{{#when::lb-xnai.appearance::tis::2}}treat it as closed.{{/when}}

## Field Responsibilities

Keep each visual fact in the field that owns it. Avoid repeating the same detail across fields.

### Cast

Write the exact featured character count in `cast` as a short natural-language noun phrase, such as `two women` or `one woman and one man`. Count every featured character, including a partially visible character with a corresponding `characters` entry. Exclude anonymous background figures.

For a multi-panel Scene, derive `scenes[].cast` from the union of featured character identities across every panel and count a recurring character once. For an individual-image Scene or Key Visual, count the featured characters visible in that image.

### Camera

Use `camera` for the image-wide viewpoint and composition. Describe the shot distance and visible body span, camera angle, perspective, focal depth, foreground or background occlusion, subject scale, focal priority, and arrangement of depth planes when applicable.

Describe the visible result rather than naming an abstract composition technique. Make the framing reveal the focal expression, action, interaction, or spatial relationship. Retain every participant and visual cue needed to understand the moment, but allow deliberate cropping and occlusion.

Do not place character appearance, attire, individual actions, setting details, or lighting in `camera`.

### Scene

Use `scene` for visual information shared by the complete image: medium, rendering style, location, spatial boundaries, time, weather, prominent props, anonymous background population, global lighting, color palette, and atmosphere.

Describe concrete environmental features rather than setting labels that lack a visual identity. Preserve an explicitly requested medium. Put requested visible text in quotation marks and reproduce the text exactly.

For a multi-panel Scene, each `panels[].scene` also owns that panel's camera and composition because panels have no separate `camera` field. State the panel's framing, viewpoint, environment, lighting, and globally shared action context in one coherent description.

### Character Positive

Use `characters[].positive` for the character's visible identity and appearance. Write a detailed natural-language noun phrase covering the character's subject identity, relative position, apparent age, hair, eyes, skin or species, body type, other identifying features, attire, and exposed body parts. Include every applicable group visible within the frame.

Start every `positive` with an article-free singular subject noun phrase followed immediately by a prepositional relative position, such as `young woman on the left`, `elderly man in the foreground`, or `female elf in the back`. Choose a natural subject term rather than forcing `girl` or `boy`. Give each featured character a position that distinguishes the character from the others in the same image or panel. Combine horizontal and depth positions when needed, such as `young woman on the left in the foreground`. Include a relative position even when only one featured character appears.

- Hair: State length, color, and style. Describe the cut, texture, and bangs when visible. Add visible details such as an ahoge, braid, messy hair, or wet hair.
- Eyes: State eye color unless the eyes are hidden or fully closed. Describe visible eye shape and distinctive features such as round eyes, sanpaku eyes, glowing eyes, or slit pupils when applicable.
- Body type: State skin color or non-human species. Describe the visible build, such as slender, chubby, muscular, toned, broad, or fat. For a female character, state visible breast size when the framing makes it relevant.
- Other features: Include visible freckles, facial hair, scars, tattoos, or other identifying features. Give the location of a scar or tattoo.
- Attire: Describe each visible garment and accessory by concrete color, material, fit, condition, and style where applicable. Break a uniform or named outfit into its visible garments instead of using the outfit's title. Distinguish headwear, upper garments, lower garments, footwear, and accessories.{{#when::toggle::lb-xnai.nsfw}} State `naked` when applicable.{{/when}}
- Exposed body parts: Include every prominently exposed body part visible within the frame, such as armpits, clavicle, cleavage, navel, thighs, or buttocks.{{#when::toggle::lb-xnai.nsfw}} Include visible nipples, pussy, anus, or penis when applicable.{{/when}}

{{#when::toggle::lb-xnai.forcedinsertion}}Insert `%%` at an internal position in every body part words. Keep other words and structural values unchanged.{{/when}}

Describe only attributes visible within the frame. Omit cropped-out clothing and body details. Keep posture, gaze, expression, action, interaction, and scene-specific lighting out of `positive` so that appearance history remains reusable across scenes.

For an eligible character with incomplete appearance information, fill only the details needed to produce a coherent visible design. Prefer common features and simple attire over distinctive inventions. Give an eligible major character with no appearance description a generic design consistent with the setting, or obscure details through framing when the composition supports it.

### Character Description

Use `characters[].description` for the character's current depiction in the selected instant. Write concise natural-language sentences that state the character's expression, gaze, posture, gesture, action, movement, contact, precise spatial relationships beyond the opening relative-position phrase, overlap, occlusion, and relationship to visible characters, props, or lighting.

Describe only the character belonging to the current entry. When an interaction requires another featured character, identify the other character by the shortest distinguishing visible trait and make each participant's role clear across their respective descriptions. Do not use story names inside descriptions because the image model receives visual character prompts rather than story identities.

Keep every `characters[].description` on a single line. Do not introduce an identifiable person who has no corresponding `characters` entry. Refer to background figures only as an anonymous collective in `scene`.

{{#when::lb-xnai.scene.comic::tisnot::0}}Add each featured character depiction to the `characters` array of every panel where the character appears. Write a separate description for each panel-specific depiction.{{/when}}

{{#when::toggle::lb-xnai.nsfw}}For explicit content, describe visible roles, body positions, contact, and direction directly and precisely.{{/when}}

### Negative

Use `characters[].negative` only when the Client explicitly specifies undesired content in Instructions Override or Client Direction. Preserve supplied wording and weights. Do not infer negative prompts from omitted or invisible details.

{{#when::keep::toggle::lb-xnai.context}}{{#when::keep::lb-xnai-history::visnot::null}}{{#when::keep::{{? {{length::{{trim::{{getvar::lb-xnai-history}}}}}} > 0}}}}

### Character Appearance History

Use these past character prompts for visual continuity. {{#when::lb-xnai.appearance::tis::0}}Prefer to reuse{{:else}}Reuse{{/when}} stable physical appearance details unless a current source changes them. Reuse only attire visible in the current frame. Do not carry forward expressions, poses, actions, or other scene-specific details. Apply current locked or closed specifications instead of conflicting history.

{{getvar::lb-xnai-history}}{{/history-length}}{{/history-null}}{{/context}}

## Composition

Stage a specific visible action within a concrete environment. Establish foreground, middle ground, and background only where those planes contribute to the image. When multiple featured characters share the image, distinguish them through camera distance, overlap, facing, contact, or foreground occlusion rather than arranging equal-sized subjects on one plane.

Give one subject or action clear primary visual weight. Use environmental boundaries and prominent props to locate the action, guide attention, constrain movement, separate characters, or connect them. Connect lighting to a visible source or direction and describe a character's individual lighting relationship in that character's `description` only when it materially affects the depiction.

Avoid an isolated centered character, interchangeable scenery, and equal-sized characters aligned at the same camera distance unless the source specifically requires that composition.

## Images

Create image prompts only for the LAST LOG ENTRY (Log #N).

{{#when::lb-xnai.kv.off::tisnot::1}}

### Key Visual

Create the main promotional image for the log entry. Capture its overall theme or emotional core rather than recreating a specific Scene.

Treat the Key Visual like a magazine cover, album cover, or other deliberately art-directed image. Make it materially distinct from every Scene through composition, viewpoint, visual device, or environmental treatment while preserving source facts and character continuity.
{{/when}}

### Scene

{{#when::lb-xnai.scene.comic::tisnot::0}}Create a structured-text {{#when::lb-xnai.jb::tis::1}}storyboard{{:else}}comic layout{{/when}} of two to four connected panels within the log entry. Panels may move across places and moments when the sequence clarifies the event.{{:else}}Create a structured-text {{#when::lb-xnai.jb::tis::1}}storyboard{{:else}}image prompt{{/when}} for one event in a specific place and moment within the log entry.{{/when}}

{{#when::toggle::lb-xnai.scene.quantityexact}}Prefer a moment with a visible change, interaction, reaction, movement, or consequential spatial relationship.{{:else}}Select a moment with a visible change, interaction, reaction, movement, or consequential spatial relationship.{{/when}} Preserve the event's visible cause and effect through every eligible participant and relevant object available to the image.

Build the eligible featured cast before selecting the moment. Include characters whose appearance is described in Narrative Universe Settings or Client requirements. Include major characters established in Narrative Universe Settings even when they have no appearance description. Select featured characters only from this eligible cast.

Feature each eligible identifiable participant required to depict the selected moment. Do not reduce an exchange, confrontation, conversation, coordinated activity, or shared reaction to an isolated character when another eligible participant is visually required. When a required story participant is ineligible, frame that participant outside the image and depict only the eligible participants' visible side of the event without referring to the omitted person.

Treat anonymous people who only establish a location's population or activity as background figures. Describe them collectively in `scene` without individual appearances, identifiers, actions, or `characters` entries. Do not reclassify an omitted source character as a background figure.

When the required substantially visible cast exceeds the configured limit, select a different moment or a coherent sub-action whose participants fit the limit. Do not remove an interaction partner while retaining an action or reaction that depends on that partner.

Preserve character and environment continuity between Scenes from the same continuous event. Repeat a continuing visible detail in each later Scene and update the description when the visible state changes.

{{#when::lb-xnai.scene.comic::tisnot::0}}

### Multi-Panel Scenes

Compose every Scene as a multi-panel comic layout with two to four connected visual beats. Keep all panels within one Scene and write the panels in reading order.

Put the Scene-wide distinct featured character count in `scenes[].cast`. Keep each panel's framing, setting, lighting, weather, props, and other shared visual information in `panels[].scene`. Repeat continuing details in every panel where they remain visible.

Treat every character appearance in every panel as a separate depiction. Add that depiction to the panel's `characters` array and preserve the character's identity across panels.
{{/when}}

#### Slots

Each `<slot num="N"/>` tag marks an insertion position between contents (`preceding -> <slot num="N"/> -> following`). Use a slot only when both immediately adjacent blocks belong to narrative paragraphs. Exclude non-narrative or non-paragraph contents such as headings, status lines, metadata, data blocks, and separators. Dialogs, images, and sound effects are considered narrative paragraphs regardless of their form.

Treat the slots immediately before the first narrative prose block and immediately after the last narrative prose block as the narrative boundaries. {{#when::toggle::lb-xnai.scene.quantityexact}}{{:else}}Keep both boundary slots unused. {{/when}}Use each slot for at most one Scene.

Locate an eligible slot before choosing each depicted moment. Depict a moment established in the narrative before the slot. Use narrative after the slot only to clarify context and continuing visible details, never to depict an action that occurs after the slot.

{{#when::toggle::lb-xnai.scene.quantityexact}}Distribute Scenes across different portions of the log when doing so preserves the required Scene count.{{:else}}Choose a distinct event moment for each Scene. Distribute Scenes across different portions of the log when suitable moments exist.{{/when}}

## Client Comments

{{#when {{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.direction}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.direction}} != null }}}} }}

The Client has specified what they want:

<instruction>
{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.focus}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.focus}} != null }}}}}}I want to focus on the character(s): "{{getglobalvar::toggle_lb-xnai.focus}}". Include at least one eligible focused character in every Scene. Apply the featured-character eligibility rules to a focused character. Keep other visible participants when the selected event requires them, but do not create a Scene centered only on other characters.

{{/when}}{{getglobalvar::toggle_lb-xnai.direction}}
</instruction>

The above instruction precedes all previous instructions.

{{:else}}

{{#when {{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.focus}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.focus}} != null }}}} }}
<instruction>
I want to focus on the character(s): "{{getglobalvar::toggle_lb-xnai.focus}}". Include at least one eligible focused character in every Scene. Apply the featured-character eligibility rules to a focused character. Keep other visible participants when the selected event requires them, but do not create a Scene centered only on other characters.
</instruction>

The above instruction precedes all previous instructions.
{{:else}}
(None specified)
{{/when}}
{{/when}}

# Example

Each leading `⇥` represents one TOON indentation level of exactly two spaces. Do not output `⇥`; use two ASCII spaces for each indentation level.

{{#when::keep::lb-xnai.scene.comic::tisnot::0}}<!-- lb:require:lb-xnai.lb.example.comic -->{{:else}}<!-- lb:require:lb-xnai.lb.example.scene -->{{/}}

- Use one `<lb-xnai>` node.
- Output in TOON format (2-space indent, array length in header).
  - The output is not YAML. Do not use YAML block syntax (`>-`, etc) even if the description is long.
- Exclude anonymous background figures from `cast` and `characters`, but describe their collective presence in `scene`.
- `characters[].name` is optional. For substantially visible character, write their full name if given, or the most identifiable form. {{#when::toggle::lb-xnai.context}}{{#when::lb-xnai-history::visnot::null}}{{#when::{{? {{length::{{trim::{{getvar::lb-xnai-history}}}}}} > 0}}}}Reuse names from the Tag History if it contains one.{{/history-length}}{{/history-null}}{{/history-toggle}} Omit the name for an isolated extremity or similarly small body fragment. {{#when::toggle::lb-xnai.japanese}}Write the name in Japanese script. Transliterate a name that has no established Japanese spelling.{{:else}}Write the name in English.{{/when}}
- `characters[].negative` is optional. `characters[].description` is required.
- Close `</lb-xnai>`.

Optional fields must be OMITTED, not left with a empty line.

{{#when::toggle::lb-xnai.scene.quantityexact}}Required{{:else}}Requested{{/when}} Scene count: {{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.scene.quantity}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.scene.quantity}} != null }}}}}}"{{trim::{{getglobalvar::toggle_lb-xnai.scene.quantity}} }}"{{:else}}1-5{{/when}}.

{{#when::toggle::lb-xnai.japanese}}Write every generated text value in Japanese, including all camera, cast, positive, negative, name, description, and scene values. Use concise, natural Japanese visual language. Keep the `<lb-xnai>` markup, TOON field keys, numeric values, Boolean values, and weight syntax unchanged.{{:else}}Write every generated text value in English.{{/when}}
