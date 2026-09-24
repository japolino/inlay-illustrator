{{#when::lb-xnai.thoughts::tis::0}}
Think step-by-step for final data, but keep minimal draft per step.

Follow this template exactly. Fill every list. Fill every `[Fields, ...]` exhaustively. Do not shorten, summarize, omit, compromise. A missing active field invalidates the draft.
{{/reason-verbal}}
{{#when::lb-xnai.thoughts::tis::1}}
The following template is your internal guide. Reason through it thoroughly, every steps of it. Step through every `[Fields, ...]` exhaustively.
{{/reason-internal}}

1. Last Log Entry: `[Log, Slot Range]`
2. Scene Count: `[Raw Input, Resolved Minimum, Resolved Maximum, Selected Count]`
3. Candidate Event Moments: `[Event, Slot][]`
4. Eligible Featured Cast In #3: `[Character, Eligibility Basis, Applicable Appearance Sources, Resolved Appearance Handling][]`
   - Recall applicable appearance, identifying features, fashion guidance, and tag lists from Client Instructions when present; Narrative Universe Settings; and the current situation and prior-record tags. Name the applicable sources without reproducing their contents.
   - Check whether Client appearance instructions are present. If present, classify each specification as reference, locked, or closed, applying the defaults for unspecified handling and completion. Record the instruction presence, resolved classification, and whether uncovered attributes may be composed; otherwise record no Client appearance instructions.
5. Slot Filter:
   - Parse each candidate as `preceding -> <slot num="N"/> -> following`. The tag is the insertion position between the two blocks, not a content block.
   - Reject each candidate when either adjacent text is non-prose or non-paragraph. Dialogs, image tags and sound effects, with or without markups, ARE prose content paragraphs.
6. Selected Scenes:{{#when::keep::lb-xnai.scene.comic::tis::0}}
   - For each Scene:
     - `[Scene Number, Distinct Event Moment, Insertion Slot]`
     - `[Framing, Visible Body Span, List of Cropped-Out Attire]`{{/when}}{{#when::keep::lb-xnai.scene.comic::tisnot::0}}
   - For each Scene: `[Scene Number, Distinct Event Moment, Insertion Slot, Distinct Featured Cast Across All Panels]`{{/when}}{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}{{#when::keep::lb-xnai.scene.comic::tis::0}}
     - Limit each Scene to {{getglobalvar::toggle_lb-xnai.characters}} substantially visible featured characters.{{/when}}{{/when}}{{#when::keep::{{and::{{? {{length::{{trim::{{getglobalvar::toggle_lb-xnai.characters}} }} }} > 0 }}::{{? {{getglobalvar::toggle_lb-xnai.characters}} != null }}}}}}{{#when::keep::lb-xnai.scene.comic::tisnot::0}}
     - Limit each Scene to {{getglobalvar::toggle_lb-xnai.characters}} distinct substantially visible featured characters across all panels, not separately per panel.{{/when}}{{/when}}{{#when::lb-xnai.scene.comic::tisnot::0}}
     - Panels for each Scene:
     - `[Panel Number, Event Beat, Framing]`
     - `[Visible Body Span, List of Cropped-Out Attire, Featured Cast][]`, with two to four panels in reading order.
     - Derive the Scene-wide `cast` from the union of featured character identities across all panels. Count a recurring character once.{{/when}}{{#when::keep::lb-xnai.kv.off::tis::0}}
7. Key Visual: `[Theme, Framing, Visible Body Span, List of Cropped-Out Attire]`{{/when}}

Lastly, verify the steps. Fix invalid items.
