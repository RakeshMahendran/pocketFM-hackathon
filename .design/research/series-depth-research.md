# Series browsing and 3D preview design

## Recommendation

Use wide, shallow cards with a dimensional cover on the left and a title plus one concise story premise on the right. Keep the premise visible before interaction. Clicking the card should open the series workspace; it should not first flip a card, open an accordion, or expose a miniature production dashboard.

This recommendation separates two jobs that had become entangled: identifying an interesting story and inspecting the production of that story. A gist is selection information. Episodes written, audio generated, and the fuller synopsis are inspection information. A page can therefore provide enough meaning to browse without putting all production details on every card.

This is a design judgment based on the requirements and the sources below, not a claim that this exact design has been user-tested. The accompanying concept uses sample synopsis wording and schematic cover art, not newly generated production content.

## Evidence and useful references

### Dimensional cards are achievable without character models

Aceternity's 3D Card Effect uses CSS perspective and supports translation and rotation of separate elements, including depth translation. That establishes a practical route to layered cover artwork without requiring a complete 3D scene. For this library, apply depth to the cover only: the title and gist should stay on a flat, readable plane. [Aceternity UI, 3D Card Effect](https://ui.aceternity.com/components/3d-card-effect).

React Bits provides a second implementation reference. Its TiltedCard source uses Motion springs and mouse coordinates to rotate and scale an image. Importantly, the examined source includes a desktop-oriented mobile warning and optional pointer-following caption. That is a reason to adapt the effect rather than copy the component's entire interaction: neither a mouse-only caption nor a mobile warning belongs in the production library. [React Bits, TiltedCard source](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/content/Components/TiltedCard/TiltedCard.jsx).

Codrops' 3D Book Showcase demonstrates physical cover thickness, front/back rotation, and opening a cover with CSS transforms. It is an explicitly experimental 2013 reference, useful for the visual construction of depth, not evidence of contemporary usability or a drop-in implementation. A serial is not necessarily a physical book, so borrow the layered-cover treatment without simulating page turning. [Manoela Ilic, Codrops, January 8, 2013](https://tympanus.net/codrops/2013/01/08/3d-book-showcase/).

### A short gist is legitimate card content

Nielsen Norman Group's card definition includes an image, title, and synopsis among the content associated with a single subject. The important distinction is relevance and hierarchy, not eliminating text altogether. For this app, the premise answers a question the cover and title often cannot: what is the conflict? This supports retaining a short gist, but does not establish an optimal word count for this specific audience. [NN/g, Cards: UI-Component Definition](https://www.nngroup.com/articles/cards-component/?lm=principles-visual-design&pt=article).

Dribbble references worth reviewing alongside the functional demos are Bagas Prayogo/Morva Labs' Digital Book Library Dashboard and Lay's 007 Books Library App Concept. These are design presentations, not usability studies. They are useful inspiration links; their popularity is not evidence that their navigation or detail presentation should be copied. Their visual assets have not been imported into the concept. [Morva Labs, Digital Book Library Dashboard](https://dribbble.com/shots/19202835-Digital-Book-Library-Dashboard); [Lay, 007 Books Library App Concept](https://dribbble.com/shots/20914237-007-Books-Library-App-Concept).

### Hover should not be the only route to understanding

W3C's hover/focus guidance identifies accidental activation, unnoticed content, and interference with the current task as risks. When additional content appears on hover/focus, it generally needs to be dismissible, hoverable, and persistent, subject to the criterion's exceptions. Keeping the gist visible avoids adding these obligations merely to read a premise. [W3C, Understanding SC 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

Radix explicitly describes its Hover Card content as ignored by screen readers. It may serve a supplementary visual preview, but it should not become the sole home of essential story information. A touch and keyboard alternative would still be needed. [Radix UI, Hover Card](https://www.radix-ui.com/primitives/docs/components/hover-card).

## Pattern comparison

The assessments below are design judgments, not measured performance scores.

| Pattern | How the gist is found | Main benefit | Main cost | Fit here |
|---|---|---|---|---|
| Wide card with layered cover and visible premise | Immediately, beside title | Browsable and readable; works without motion | Repeats one sentence per series | Recommended |
| 3D flip card with synopsis on the back | Tap or hover to flip | Clear front/back metaphor | Hides the premise; adds a step before opening; replaces art | Reject as default |
| Hover expansion or floating preview | Hover/focus, plus separate touch support | Dense initial grid | Can obscure neighbours; accessibility and dismissal complexity | Poor fit after the rejected overlay |
| Shelf with one shared selected-story preview | Select a cover | Only one long synopsis on the page | More selection steps; browsing and opening become separate actions | Alternative if longer previews become essential |
| Fully navigable WebGL shelf/carousel | Rotate or navigate through objects | Strong visual spectacle | Items can be obscured; more rendering and interaction complexity | Not recommended for the core library |

## Proposed card specification

The desktop starting point is a card approximately 440–540 pixels wide and 210–250 pixels high, with a cover around 120–145 pixels wide. These are exploratory design dimensions, not a fixed requirement. The cover height must have an independent limit: increasing card width must not enlarge a portrait image proportionally and create another tall poster card.

Each card contains a cover, title, and one complete premise sentence. An understated arrow can indicate navigation. There are no clearance badges, source explanations, score strips, production panels, or repeated Series details controls in this library treatment. The source records and individual-series capabilities remain intact elsewhere.

Aim for approximately 16–24 words in an editorially approved gist. This is a proposed content budget, not a research finding. The sentence should identify the protagonist or situation and the central conflict. Do not promote a long sales rationale to display text, invent claims, or assume that visual line-clamping produces a meaningful summary. Retain the full synopsis on the series page. Existing excerpt logic can be a transitional fallback, not a substitute for reviewed short copy.

The visual concept deliberately excludes production counts so that it can answer the outstanding browsing question without reintroducing the data density already rejected. If later observation shows that editors choose which series to work on primarily by production progress, add one restrained progress line and test that separately rather than adding a block of metrics by default.

## Motion and implementation boundary

Use a small resting perspective angle and a visible cover edge. On a fine pointer, the artwork can respond within a proposed 3–6 degree tilt range. The text remains still. There is no autoplay carousel, spinning object, particle background, or pointer-following synopsis. Touch users receive the same premise without hovering, and the entire navigation target remains usable without animation.

Respect reduced motion by removing tilt transitions and using a flat presentation. W3C documents the `prefers-reduced-motion` technique for preventing interaction-triggered motion. [W3C, Technique C39](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html).

Three.js is technically possible, not disallowed. It becomes a useful choice if approved model assets, real surface lighting, or interactive inspection of a character are required. For a cover plus text, CSS perspective already provides the proposed visual behavior. If WebGL is introduced later, preserve HTML titles and summaries, provide a static fallback, and render only when needed; the Three.js manual warns that continuous rendering of an unchanged scene wastes power. No device-specific performance measurements or bundle-size promises are made here. [Three.js, Rendering on Demand](https://threejs.org/manual/en/rendering-on-demand.html).

## Validation before implementation

Show a prototype with several real titles and reviewed premises. Ask a new viewer to describe two stories without opening them, choose a series, and find its episodes. Observe whether they understand the card action and whether the gist helps selection. Repeat on touch and keyboard, then with reduced motion and enlarged text. Evaluate title wrapping, long premises, missing artwork, and a narrow viewport before selecting final dimensions.

The proposed design must preserve those outcomes when effects are disabled. This is the acceptance criterion that separates useful dimensional artwork from an interaction that requires users to learn a visual trick.

## Sources and limitations

The linked component documentation and source code establish feasibility; W3C establishes accessibility requirements and techniques; NN/g supplies a general card-content definition. Dribbble and Codrops supply inspiration, not evidence that a specific layout will improve task completion. Undated web documentation and source were accessed September 14, 2026; mutable main-branch source can change. The Codrops experiment is explicitly dated above. No new user study, production implementation, third-party asset import, or dependency installation was performed for this recommendation.
