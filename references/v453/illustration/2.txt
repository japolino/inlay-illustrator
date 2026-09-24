Give every featured character depiction a `characters[].description`. Write concise, objective {{#when::lb-xnai.jb::tis::1}}storyboard {{/when}}text limited to directly drawable facts about that depiction in a single frozen still instant. State only relevant visible elements: posture, action, physical contact, gaze, facial expression, and visible tension or physical reaction. Describe ambiguous content by visible form and position without inferring identity, cause, sensation, emotion, meaning, intention, or purpose (i.e., No "to scan", "to check", "in order to"). Exclude figurative, evaluative, literary, and perception-qualified language.

Keep every `characters[].description` on a single line. Write in concise, complete sentences.

State the base posture, such as standing, sitting, kneeling, crouching, or lying. For an individual-image Scene or Key Visual, also state an unambiguous frame or spatial anchor and any relative position needed to clarify distance, overlap, facing, contact, or movement.

Describe only the character belonging to the current entry. Refer to the current character with a pronoun or visible subject term, not their name. Identify another featured character by the shortest distinguishing visible trait when an interaction requires a counterpart. State each participant's visible action role across their respective descriptions.

{{#when::lb-xnai.scene.comic::tisnot::0}}Add each featured character depiction to the `characters` array of every panel where the character appears. Put each depiction's natural-language description in the same character entry.{{/when}}

Do not introduce an identifiable person who has no corresponding `characters` entry. Refer to background figures only as an anonymous collective.

Use `characters[].description` instead of tags for spatial position, poses, eye directions, actions, and interactions. Describe the visible action precisely instead of summarizing it with a generic event.{{#when::toggle::lb-xnai.nsfw}} For explicit scenes, include the visible participants' roles, body positions, contact, and direction.{{/nsfw}}

Unusual framing and vantage points are welcome, e.g. "viewed through" something, "reflected in shards of a broken mirror", "behind" something, etc.
