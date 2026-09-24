# Image Prompt Details

Build each image prompt as structured {{#when::lb-xnai.jb::tis::1}}storyboard{{:else}}image prompt{{/when}} data. Use camera and environment tags for the frame, and character tags plus a factual description for each featured character depiction.

## Components

### Common Rules

Use common, objective, visualizable concepts. (No "Swordmaster outfit" or "Guild hall" - What do they look like? I don't know. Describe.)

{{#when::toggle::lb-xnai.japanese}}Use Danbooru tag concepts, but render every tag in Japanese. Treat every English tag and phrase in this guideline as a semantic reference that requires Japanese translation in the output.{{:else}}Use Danbooru tags.{{/when}}

{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}Limit substantially visible featured characters in each individual-image Scene{{#when::keep::lb-xnai.kv.off::tisnot::1}} and Key Visual{{/}} to max {{getglobalvar::toggle_lb-xnai.characters}}. A character is substantially visible when the frame shows the face or a substantial upper- or lower-body region, even if the rest is cropped.{{#when::keep::lb-xnai.scene.comic::tisnot::0}} For a multi-panel Scene, apply this limit to distinct substantially visible featured characters across the complete Scene, not separately to each panel.{{/when}} Anonymous background figures do not count toward this limit. A featured character shown only as an isolated extremity or similarly small body fragment may exceed the limit and still needs a character entry and count tag, such as `boy, out of frame, fair skin, hand`.{{/when}}

#### Tagging Principles

Curly and square braces control tag weights like `{tag}`, `[tag]`. `N::tag::` also controls the tag's weight explicitly. Copy only Client-specified weights from Instructions Override or Client Direction. Preserve each weight verbatim, including internal whitespace and punctuation (`0.4::cloud9 ::`, not `0.4::cloud9::`).

When Instructions Override is present, classify each character appearance specification by how the Client frames its use. Classify source material, prior designs, and examples offered to draw from as reference; requirements for exact preservation as locked. Classify a specification as closed when the Client requires exact preservation and prohibits adding unspecified appearance or attire attributes. Use the unspecified-handling default when the Client provides no framing that determines the specification's role.

- Reference: Preserve the intended traits while applying this guideline's tag rules.
- Locked: Preserve every specified attribute exactly. Copy supplied tags verbatim into that character's `positive`, preserving their order within each source group and their weight syntax. Convert supplied prose to tags without changing its specified attributes. Do not replace, merge, generalize, or reclassify supplied tags. Override the tag-building order for covered attribute groups.
- Closed: Apply the locked rules without adding unspecified appearance or attire attributes. Compose scene-dependent tags unless the source prohibits all additions.

For a locked specification with unspecified completion, {{#when::lb-xnai.appearance::tis::2}}treat it as closed anyway.{{:else}}compose uncovered attributes.{{/when}} For a specification with unspecified handling, {{#when::lb-xnai.appearance::tis::0}}treat it as reference.{{/when}}{{#when::lb-xnai.appearance::tis::1}}treat it as locked.{{/when}}{{#when::lb-xnai.appearance::tis::2}}treat it as closed as well.{{/when}}

{{#when::toggle::lb-xnai.forcedinsertion}}Insert `%%` at an internal position in every image tag, including every {{#when::lb-xnai.scene.comic::tis::0}}`camera`, {{/comic}}`cast`, `positive`, `negative` (if any), and `scene` tag. Keep field names, character names, descriptions, markup tags, and structural values unchanged.{{/when}}

### Composition

Stage a specific visible action within its environment. Choose the camera position, framing, depth, foreground elements, and motivated lighting according to the focal information. Describe the visible result of each composition technique rather than naming the technique.

- Choose the framing that best reveals the focal information, including the relevant expression, body region, action, interaction, or spatial context. Retain every participant and visual cue needed to understand the moment, but do not widen the framing merely to keep every participant fully visible. Crop or partially occlude a secondary participant when their identity and role remain legible.
- For each individual-image Scene{{#when::keep::lb-xnai.kv.off::tisnot::1}} and Key Visual{{/}}, establish at least two depth planes. When multiple featured characters share the image, use unequal camera distance, overlap, or foreground occlusion rather than environmental layers alone.
- Place the focal action deliberately within the frame. Use asymmetry, foreground occlusion, leading lines, frame-within-frame elements, or negative space when those choices strengthen the scene.
- Use prominent props and environmental boundaries to reveal where the action occurs, guide attention, constrain movement, separate characters, or connect characters.
- Connect lighting to the physical scene. State the light source or direction in `scene`, and put each featured character's lighting relationship in that character's `description` when the relationship matters.
- Keep the focal action and each featured character's identity legible while allowing controlled cropping, overlap, and occlusion. Give one subject or action clear primary visual weight and keep secondary details subordinate.
- For each individual-image Scene{{#when::keep::lb-xnai.kv.off::tisnot::1}} and Key Visual{{/}}, avoid equal-sized subjects aligned on the same camera-distance plane{{#when::lb-xnai.camera::tisnot::0}} and flat profile staging like side-by-side cowboy shots{{/when}}, an isolated centered character, empty space without a compositional role, and a generic backdrop that could be replaced without changing the scene.

### Camera

{{#when::lb-xnai.scene.comic::tisnot::0}}{{#when::keep::lb-xnai.kv.off::tisnot::1}}For Key Visual, put exactly one Base Perspective and one Character Framing in `keyvis.camera`.{{/kv}}{{:else}}Put exactly one Base Perspective and one Character Framing in every `camera`.{{/when}}

#### Base Perspective

- from (above, from behind, from below, from side)
- high up
- straight-on{{#when::lb-xnai.kv.off::tisnot::1}}
- sideways, upside-down (For Key Visual only){{/kv}}

Use modifier sets supported by the depicted content and composition: `over-the-shoulder`; `foreshortening`; `depth of field` with `blurred background` or `blurred foreground`; `fisheye`; `dynamic angle`; `dutch angle`. {{#when::lb-xnai.camera::tis::0}}Add at most one set when viewpoint or geometry requires it.{{/when}}{{#when::lb-xnai.camera::tis::1}}Layer up to two compatible sets when viewpoint, depth, motion, or tension supports them.{{/when}}{{#when::lb-xnai.camera::tis::2}}Layer up to three compatible sets, favoring stronger combinations as motion or tension increases.{{/when}}

#### Character Framing

In order of increasing view, from head:

- portrait (head and shoulders)
- upper body (head to waist)
- cowboy shot (head to mid-thighs, no feet)
- feet out of frame (head to shins or ankles)
- full body
- wide shot

From legs:

- lower body (waist to feet)
- head out of frame
- eyes out of frame

Specific body parts: `(part) focus` with `close-up`.

Based on framing, some apparels should not be described at all.

### Environment

{{#when::toggle::lb-xnai.nsfw}}If the image would be explicit, start with `wfsn`.{{/when}}

#### Cast

Put the exact featured character count in `cast` with strictly number + girl(s) or boy(s).

- 1girl
- 2girls
- 1girl, 1boy

And so on. Partially visible featured characters also contribute to the number.{{#when::keep::lb-xnai.scene.comic::tisnot::0}} For a multi-panel Scene, derive `scenes[].cast` from the union of featured character identities across every panel, counting a recurring character once.{{#when::keep::lb-xnai.kv.off::tisnot::1}} For Key Visual, `keyvis.cast` counts the featured characters visible in the image.{{/kv}}{{/comic}}{{#when::keep::lb-xnai.scene.comic::tis::0}} Each `scenes[].cast`{{#when::keep::lb-xnai.kv.off::tisnot::1}} and `keyvis.cast`{{/kv}} counts the featured characters visible in that image.{{/scene}}

Represent anonymous background population with separate visual environment tags such as `crowd`. Do not add those figures to `cast`.

#### Location and Lighting

Start `scene` with either `interior` or `exterior`, then add concise location anchors such as bedroom, forest, meadow, or horizon.

Establish the world-building, time, and weather. Setup lighting with multiple tags: daylight, noon, bright, sunset, night, dark, backlighting, sidelighting, underlighting, warm, cool, etc.

Add prominent props in "color + object": white computer, wooden table. Common, objective, visualizable concept rule applies (`lobby`, not `association lobby`).

Keep location, spatial anchors, lighting, weather, prominent props, and anonymous background population in `scene`. Put a featured character's relationship to the setting in that character's `description`.

### Characters

Build each featured character's `positive` tags in this order: a combined gender-and-relative-position opener such as `girl on the left`, apparent age, hair, eyes, skin or species, body type, attire, expression, and exposed body parts. Include every visible required group. Tag only in-frame visible attributes of a partially visible character.

Use a single combined gender-and-relative-position opener at the start of every `positive`, such as `girl on the left`, `girl in the foreground`, or `boy in the back`. Give each featured character a position that distinguishes the character from the others in the same image or panel. Combine horizontal and depth positions when needed, such as `girl on the left in the foreground`. Include a relative position even when only one featured character appears.

Build the eligible featured cast before selecting image moments. Include characters whose appearance is described in Narrative Universe Settings or Client requirements. Also include major characters established in Narrative Universe Settings when they have no appearance description. Select featured characters only from this eligible cast. Give every featured character a corresponding `characters` entry.

Within the eligible cast, feature each identifiable story participant and each person who performs an individually described action in the selected moment. A story participant outside the eligible cast cannot appear as a featured character, a partially visible character, or an anonymous background figure. When a selected moment includes an ineligible story participant, depict only the eligible participants and keep every visual description limited to those eligible participants.

Treat anonymous people who only establish the population and activity of a location as background figures. Describe background figures collectively in `scene` without adding `characters` entries, individual identifiers, detailed appearances, or individually traceable actions. Populate a location with background figures when visible public or communal activity makes the setting more credible, but keep those figures subordinate to the featured action. Do not reclassify an omitted source character as a background figure.

After `girl` or `boy`, tag apparent age as `child`, `adolescent`, `male` or `female`, `mature male` or `mature female`, or another applicable age tag.

Age tags are strictly for appearance only. If the character is middle-aged woman but looks like a teen, `adolescent` would be more appropriate than `mature female`.

#### Appearance

Apply the following requirements to every group visible in-frame.

- Hair
  - Required: Length (very long to short), color, style.
  - Style: Cut (pixie cut, undercut, wolf cut, slicked back, ...), texture (wavy, straight, ...), bangs (swept, parted, choppy bangs, hair between eyes, over one eye, ...).
  - Addition: ahoge, braid, or state like messy, wet.
- Eyes
  - Required unless not visible or fully closed. Still include `(color) eyes` for `from behind` because the image model may render eyes despite viewpoint.
  - Shape and state: tareme, tsurime, jitome, sanpaku, round eyes, slit pupils, ... Optionally tag eye and pupil states if reaction is important, such as constricted pupils, dilated pupils, rolling eyes, dashed eyes, empty eyes, ...
- Body type
  - Required: Skin color. If non-human such as elves, specify the race.
  - Recommended: slim, slender, chubby, muscular or toned, broad, fat
  - Required if female: Breast size: `small/medium/large/huge breasts`
- Other features
  - freckles, facial hair
  - For scars or tattoos, specify location: `barcode tattoo on right forearm`.
- Attire: For each item, specify color, material, adjectives, style. Be specific as possible. Only tag items visible in-frame.{{#when::toggle::lb-xnai.nsfw}}
  - Requires `naked` if naked.{{/nsfw}}
  - Disassemble uniforms into explicit parts.
  - Headwear: red baseball cap, pink metallic crown
  - Top: topless, white loose cloth shirt, black see-through silk dress with side slit.
  - Bottom: bottomless, gray tight jeans, olive green long cargo pants.
  - Footwear: white ankle socks, black dirty sneakers, bare feet
  - Accessories: small blue gem necklace, black canvas backpack
- Expression: annoyed, angry, embarrassed, indifferent, blush, grin, etc. Specify all applicable. Limit tags to clear, visually identifiable emotions.
- Exposed body parts: Tag every applicable exposed body part visible within the frame: `armpits`, `clavicle`, `cleavage`, `navel`, `thighs`, `buttocks`, {{#when::toggle::lb-xnai.nsfw}}`nipples`, `pussy`, `anus`, `penis`{{/nsfw}}...

For eligible characters with partial descriptions, fill in missing details creatively within settings. Give an eligible major character with no appearance description a generic, nondescript design consistent with the setting. Prefer common features and simple attire over distinctive invented traits. Use `head out of frame`, `faceless`, an obscured face, a rear view, or cropping when the composition supports it.

#### Positive and Negative Tags

Only label positive tags. Negative tags: only include if the Client explicitly specifies them in Instructions Override or Client Direction. Do not infer negatives from any other source.

For positive tags, requirements still apply (unless explicitly overridden or emphasized), such as:

- Required tags must be present still.
- Tag only elements VISIBLE IN-FRAME.
  {{#when::keep::toggle::lb-xnai.context}}{{#when::keep::lb-xnai-history::visnot::null}}{{#when::keep::{{? {{length::{{trim::{{getvar::lb-xnai-history}}}}}} > 0}}}}

#### Character Tag History

Use these past character tags for continuity. {{#when::lb-xnai.appearance::tis::0}}Prefer to reuse{{:else}}Reuse{{/when}} stable physical appearance tags verbatim unless a current source changes them. Reuse only in-frame attire tags, dropping cropped-out items. Ignore expression tags. Apply current locked or closed specifications instead of conflicting history tags.

{{getvar::lb-xnai-history}}{{/history-length}}{{/history-null}}{{/context}}

### Character Description

{{#when::keep::lb-xnai.description::tis::1}}<!-- lb:require:lb-xnai.lb.description.low -->{{:else}}<!-- lb:require:lb-xnai.lb.description.high -->{{/}}

## Images

Compose each image through clear spatial staging and deliberate framing, not literary description.

Important note: You are to tag for the LAST LOG ENTRY (Log #N) only.

{{#when::lb-xnai.kv.off::tisnot::1}}

### Key Visual

The main promotional image of the log entry. Captures the overall theme or emotional core, not a recreation of any specific scene.

Key Visual should be boldly produced like a magazine cover or album art. Be daring: unconventional framing and narrative devices are encouraged, even those that would never appear in a Scene.

Make the Key Visual materially distinct from every Scene through composition, visual device, viewpoint, or environmental treatment while preserving source facts and character continuity.
{{/}}

### Scene

{{#when::lb-xnai.scene.comic::tisnot::0}}A structured-text {{#when::lb-xnai.jb::tis::1}}storyboard{{:else}}comic layout{{/when}} of two to four connected comic panels within the log entry. Panels may move across places and moments when the sequence clarifies the event.{{:else}}A structured-text {{#when::lb-xnai.jb::tis::1}}storyboard{{:else}}image{{/when}} frame of an event in a specific place and moment within the log entry.{{/when}}

{{#when::toggle::lb-xnai.scene.quantityexact}}Prioritize a moment with a visible change, interaction, reaction, movement, or consequential spatial relationship.{{:else}}Select a moment with a visible change, interaction, reaction, movement, or consequential spatial relationship.{{/when}} Preserve the event's cause and effect through every eligible participant and visible object available to the image. When another story participant is ineligible, frame that person outside the image and depict the eligible participant's visible side of the event without referring to the omitted person in the image data. Do not reduce an exchange, confrontation, conversation, coordinated activity, or shared reaction to one eligible participant's isolated pose when another eligible participant is required.

Derive the featured cast from the eligible participants in the selected moment before writing character prompts, and include every eligible identifiable participant required to depict that moment. When a character limit is configured, keep the substantially visible featured cast within that limit; fragment-only featured characters may exceed it. Include multiple eligible interacting characters together when they fit the configured limit or when no limit is configured. When the required substantially visible cast exceeds a configured limit, select a different moment or a coherent sub-action whose visible participants fit the limit. Do not remove an eligible interaction partner while retaining an action or reaction that depends on that partner. Add anonymous background figures separately when the location benefits from visible population.

Apply the Composition rules to the selected event. Make the acting, receiving, observing, approaching, blocking, or reacting role of each featured character legible through unequal scale, depth, overlap, or contact rather than flat side-by-side profile staging. Environment details alone do not turn an isolated character depiction into a Scene.

Preserve character and environment continuity between Scenes from the same continuous event. Repeat a continuing detail in each later Scene where that detail remains visible, and update the tags when the visible state changes.

{{#when::lb-xnai.scene.comic::tisnot::0}}

#### Multi-Panel Scenes

Compose every Scene as a multi-panel comic layout with two to four connected visual beats. Keep all panels within one Scene.

Put the Scene-wide distinct featured character count in `scenes[].cast`, then add a `panels` array with two to four panel objects in reading order. Keep setting, time, lighting, weather, props, and other panel-specific environment tags in `panels[].scene`; repeat continuing environment tags in every panel where they remain visible.

Treat every featured character appearance in every panel as a separate depiction. Add the depiction to that panel's `characters`. Prompt each entry for visible attributes and a character-specific description while preserving identity continuity.
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
- Exclude anonymous background figures from `cast` and `characters`, but describe their collective presence with tags such as `crowd`.
- `characters[].name` is optional metadata and is not part of the image prompt. Keep its value out of `positive` and `description`. For substantially visible character, write their full name if given, or the most identifiable form. {{#when::toggle::lb-xnai.context}}{{#when::lb-xnai-history::visnot::null}}{{#when::{{? {{length::{{trim::{{getvar::lb-xnai-history}}}}}} > 0}}}}Reuse names from the Tag History if it contains one.{{/history-length}}{{/history-null}}{{/history-toggle}} Omit the name for an isolated extremity or similarly small body fragment. {{#when::toggle::lb-xnai.japanese}}Write the name in Japanese script. Transliterate a name that has no established Japanese spelling.{{:else}}Write the name in English.{{/when}}
- `characters[].negative` is optional. `characters[].description` is required.
- Close `</lb-xnai>`.

Optional fields must be OMITTED, not left with a empty line.

{{#when::toggle::lb-xnai.scene.quantityexact}}Required{{:else}}Requested{{/when}} Scene count: {{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.scene.quantity}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.scene.quantity}} != null }}}}}}"{{trim::{{getglobalvar::toggle_lb-xnai.scene.quantity}} }}"{{:else}}1-5{{/when}}.

{{#when::toggle::lb-xnai.japanese}}Write every generated text value in Japanese, including all camera, cast, positive, negative, name, description, and scene values. Translate canonical tag spellings into concise Japanese visual terms. Keep the `<lb-xnai>` markup, TOON field keys, numeric values, Boolean values, and tag-weight syntax unchanged.{{:else}}Write every generated text value in English.{{/when}}
