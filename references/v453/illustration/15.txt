{{#when::lb-xnai.thoughts::tis::0}}
Think step-by-step for final data, but keep minimal draft per step.

Follow the templates. Fill every list. Fill every `[Fields, ...]` exhaustively. Do not shorten, summarize, omit, compromise. A missing active field invalidates the draft.
{{/reason-verbal}}
{{#when::lb-xnai.thoughts::tis::1}}
The following templates are your internal guide. Reason through one thoroughly, every steps of it. Step through every `[Fields, ...]` exhaustively.
{{/reason-internal}}

For RegenerateScene:

1. Interaction Target: `[Action, Target Slot, Target Scene Index]`
2. Slot Context: `[Insertion Slot, Preceding Depicted Moment, Following Continuity Prose]`
3. Selected Scene:{{#when::keep::lb-xnai.scene.comic::tis::0}}
   `[Distinct Event Moment, Framing, Visible Body Span, Cropped-Out Attire, Featured Cast]`{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}
   - Limit the Scene to {{getglobalvar::toggle_lb-xnai.characters}} substantially visible featured characters.{{/when}}{{/when}}{{#when::keep::lb-xnai.scene.comic::tisnot::0}}
     `[Distinct Event Moment, Distinct Featured Cast Across All Panels]`{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}
   - Limit the Scene to {{getglobalvar::toggle_lb-xnai.characters}} distinct substantially visible featured characters across all panels.{{/when}}
   - Panels: `[Panel Number, Event Beat, Framing, Visible Body Span, Cropped-Out Attire, Featured Cast][]`, with two to four panels in reading order.
   - Derive the Scene-wide `cast` from the union of featured character identities across all panels. Count a recurring character once.{{/when}}
4. Eligible Featured Cast: `[Character, Eligibility Basis, Applicable Appearance Sources, Resolved Appearance Handling][]`
   - Recall applicable appearance, identifying features, fashion guidance, and tag lists from Client Instructions when present; Narrative Universe Settings; and the current situation and prior-record tags. Name the applicable sources without reproducing their contents.
   - Check whether Client appearance instructions are present. If present, classify each specification as reference, locked, or closed, applying the defaults for unspecified handling and completion. Record the instruction presence, resolved classification, and whether uncovered attributes may be composed; otherwise record no Client appearance instructions.

---

For DirectScene:

1. User Direction Analysis: `[Stated Goal, Action Scope (Add / Modify / Remove / Key Visual), Target Details]`
2. Slot and Target Scope:
   - For adding scenes: `[Target Operation: add, Target Path: /scenes/-, Chosen Unused Slot: N, Preceding Depicted Moment, Following Continuity Prose]`
     - Confirm `<slot num="N"/>` exists in chat log and its number is not in `scenes`.
   - For modifying scenes: `[Target Operation: replace, Target Index, Specific Target Paths (such as /scenes/{index}/camera, /scenes/{index}/characters/{c}/positive, or full scene)]`
   - For removing scenes: `[Target Operation: remove, Target Index]`
   - For Key Visual: `[Target Operation: add or replace or remove, Target Path: /keyvis]`
3. Selected Scene or Field Details:{{#when::keep::lb-xnai.scene.comic::tis::0}}
   - For adding or majorly rewriting a Scene:
     `[Distinct Event Moment, Framing, Visible Body Span, Cropped-Out Attire, Featured Cast]`{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}
     - Limit the Scene to {{getglobalvar::toggle_lb-xnai.characters}} substantially visible featured characters.{{/when}}
   - For field-only edits (such as camera, pose, attire, or scene setting): specify only the replacement values for target fields.{{/when}}{{#when::keep::lb-xnai.scene.comic::tisnot::0}}
   - For adding or majorly rewriting a Scene:
     `[Distinct Event Moment, Distinct Featured Cast Across All Panels]`{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}
     - Limit the Scene to {{getglobalvar::toggle_lb-xnai.characters}} distinct substantially visible featured characters across all panels.{{/when}}
     - Panels: `[Panel Number, Event Beat, Framing, Visible Body Span, Cropped-Out Attire, Featured Cast][]`, with two to four panels in reading order.
     - Derive the Scene-wide `cast` from the union of featured character identities across all panels. Count a recurring character once.
   - For field-only edits: specify only the replacement values for target fields.{{/when}}
4. Eligible Featured Cast: `[Character, Eligibility Basis, Applicable Appearance Sources, Resolved Appearance Handling][]`
   - Recall applicable appearance, identifying features, fashion guidance, and tag lists from Client Instructions when present; Narrative Universe Settings; and the current situation and prior-record tags.
   - Classify specifications as reference, locked, or closed. User direction overrides conflicting history. Keep untouched character attributes consistent.

---

Lastly, verify the steps. Fix invalid items.
