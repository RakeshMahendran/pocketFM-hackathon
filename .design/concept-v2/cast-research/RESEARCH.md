# Cast UX exploration — three static screen designs

Date: 2026-09-13. All options deliberately share colors, typography, cast data and stock GLB assets. Compare workflows, not themes.

## Findings applied

1. **Recognition over recall.** Keep named people and navigation visible. A new user should not memorize who each portrait represents. Source: https://www.nngroup.com/articles/recognition-and-recall/
2. **Progressive disclosure.** Keep selection, primary action and meaningful knowledge boundary visible. Character biographies, full beat lists and rare controls remain available through explicit labels. Source: https://www.nngroup.com/articles/progressive-disclosure/
3. **Selectable versus clickable tiles.** Choose one person without conflating selection with navigation or generation. Use a visible single-selection cue and a separate action. Source: https://carbondesignsystem.com/components/tile/usage/
4. **Direct carousel access.** A focused character view must not require sequential swiping. Show named thumbnails and previous/next controls. No autoplay. Sources: https://www.w3.org/WAI/tutorials/carousels/ and https://www.nngroup.com/articles/mobile-carousels/
5. **Production-feasible 3D.** The asset quality demonstrated is the asset quality delivered: Kenney Blocky Characters v2, CC0, loaded from GLB and rendered with Three.js 0.180.0. Source: https://kenney.nl/assets/blocky-characters

These sources support component-level principles. They do not establish which of these three specific compositions will perform best. That is a design hypothesis to test with users.

## Options

### 01 — Cast library

Persistent application sidebar, show tabs, selectable portrait grid, contextual inspector.
Flow: pick a person → inspect story potential → choose a starting moment.
Strength: visible alternatives and a familiar return path; scales to larger casts.
Cost: less immersive; grids can become noisy if metrics are repeated on each tile.
Recommendation: use for the default cast screen. Render unselected avatars as images; only selected detail needs live 3D.

### 02 — Casting stage

Top navigation, large selected model, adjacent decision panel, named thumbnail filmstrip.
Flow: meet a character → read their premise → develop their story.
Strength: character presence and low decision density.
Cost: weaker comparison and less efficient for large casts. Provide a grid switch and direct thumbnail selection.
No automatic movement, no pointer-only rotation requirement, no hidden swipe navigation.

### 03 — Moment workspace

Compact labelled rail, episode navigation, canon-moment list, immutable source panel, selectable witnesses, contextual action.
Flow: choose the crossing point → choose whose perspective matters → develop this perspective.
Strength: explains the canon-safe spin-off mechanism in the act of choosing.
Cost: assumes familiarity with the mainline; keep the cast-first route available.
This changes the workflow meaningfully, not merely its arrangement.

## Content and limits

- Jignesh full-season counts: knows 4, blind 18, from schemas/samples/ipl_beats.json. These are counts of moments, not people. Generation must still derive time-bounded constraints at the selected scene.
- b014 is the clean-six/dot-ball crossing point. b015 and b016 descriptions are based on the sample beat sheet.
- Pankaj is not promotable in the sample character fixture. He stays visible and is never recommended.
- Character outfits and identities are STOCK STAND-INS. They are not finished art for Jignesh, Rafiq, Bhavlo or Pankaj.
- No claims that a text description automatically generates bespoke 3D models. Custom clothing and likeness require asset work.
- Source GLB mapping: Jignesh proxy = character-b; Rafiq proxy = character-a; Bhavlo proxy = character-c; Pankaj proxy = character-k.
- Each of these four models was loaded successfully and reports 27 animation clips, including idle. The delivered screens are frozen renders, not an interactive prototype.
- Selection does not spend money. “Develop” proceeds to configuration/cost review, retaining the existing generation authority boundary.
- Validator proof and control-pair requirements remain applicable downstream; they are not removed by any of these cast layouts.

## Assets and export

Original CC0 license: vendor/kenney/License.txt.
Renderer MIT license: vendor/THREE-LICENSE.txt.
render-assets.html and render-assets.js produce the portraits from actual models.
export-assets.cjs saves the rendered PNG portraits.
index.html + screens.css are the three artboards. export-screens.cjs exports individual 1440×900 PNGs and checks layout bounds.
Production Next.js files have not been changed.
