# Studio UI revamp

The user's latest approved direction supersedes the earlier dark cinematic artboards: a light paper / sage / forest application, persistent navigation, focused workspaces, and detail on demand. The default cast interaction follows option 01 in `.design/concept-v2/cast-research/`.

## Implemented

- Shared studio rail, active navigation, show-level context and tabs; no invented pipeline destinations.
- Home: two real entry jobs; longer capability descriptions in a native disclosure.
- Discovery: smaller recommendation, visual cards, category filters and comparison view. Fixed five-axis order; total-score emphasis matches actual ranking. Blocked stories stay visible.
- Candidate: story/evidence area beside an always-visible clearance and commissioning panel. Existing order sizes, cost, operator command and refusal retained.
- Shows: cover library with release state; full production detail one click down.
- Season: compact show header, episode/release workspace, visual cast entry, reference disclosures.
- Cast: freely select a character without starting a run; selected-character inspector; knows/blind counts; production options and full character details retained.
- Character: profile, canon limits, episodes and generation panel. Re-generation is a disclosure, not the default action on an already-written character.
- Episode: recording alongside release status; script and performance detail on demand. Existing audio mixes, languages and playback behavior retained.
- Spin-off episode: validator findings and constrained/control comparison remain unfolded, including beat IDs and quoted lines.
- Search replay and commissioning progress share the studio shell and surfaces. Neither implies a new live search or generation capability.

## Shared implementation

`web/components/ui.tsx` owns new surfaces: Panel, PageHead, CharacterArt, CharacterCard, and the existing ArtCard, Shelf, Stat, Pill, Action, Reveal, SectionHead and Split. `KnowledgeSplit` delegates to Split. Native `details name` groups handle disclosures without JavaScript. `StudioNav.tsx` only handles route-aware navigation.

`web/lib/presentation.ts` holds the existing sourcing hook excerpt helper. The four product-copy files were not consolidated.

## Art / 3D boundary

No generated likeness or 3D service has been added. Actual character data uses labelled silhouette/initial placeholders until approved portraits or renders are available. `CharacterArt` accepts a source, and `StoryArt` retains its source slot and deterministic gradient fallback. The Kenney stock models remain design research assets, not asserted likenesses of production characters.

## Safety and verification

- Kept branch `story-publish-tweaks`; no commits, no changes to main.
- Existing user edits, especially `data/stories/evt_gandhinagar_tribunal/publish.json`, were preserved. Tests read its current release count rather than requiring all episodes to be published.
- The ordinary e2e sweep no longer starts a paid writer. The session test's generation branch requires explicit `CF_ALLOW_PAID_E2E=1` against a disposable fixture. Cookie-free entry and navigation are exercised by default.
- The three known timeout-literal type errors in `web/tests/e2e/demo.spec.ts` remain. No type-check bypass was added.
- Full e2e and final screenshot review are required before handoff. UI regression tests live in `web/tests/e2e/studio.spec.ts`; the existing sourcing, audio, flow, layout, keyboard and slow-network suites remain in use.

Local preview: `http://localhost:3000/` opens Home directly. The Get started gate and Sign out control are removed. Fresh visits automatically use the default editor byline; existing valid editor cookies remain honoured. This is demo attribution, not authentication.

The sidebar's **How it works** link opens `/how-it-works`. The full studio guide has moved there from Home; no guidance content was deleted.

The redundant “Your workspace” top bar and demo editor profile/avatar/welcome have been removed. Primary sidebar navigation and show-specific tabs remain; action attribution and historical bylines are unchanged in the background.

The series library now opens with **Your series** and cover cards, without the aggregate totals, introductory disclosure or recommended-next-step block. Production details use the shared native `SidePanel`: single-open, half the desktop viewport on the right, full width on mobile, independently scrollable, with a keyboard-operable close control. Clearance remains visible on each card; full production fields remain in the panel.

The refined library uses the shared `SeriesCard` primitive: portrait cover slot, title, episode count, clearance and one separate production-details control. There is no repeated “Open series” CTA on the card. Opening details compacts the left library into horizontal rows; selecting another detail control switches the native single-open group without writing data. Monogram covers are deterministic placeholders; the `art` slot is ready for approved images. No library dependency was added. The choice favours clear browsing over dashboard metrics or poster-only hover interactions.

## Verification result

Individual show update (supersedes the earlier season hero): title, short gist, episodes written, audio generated, and episodes published lead the page. The shared `SeriesOverview` owns this composition. Episodes follow immediately with title, audio availability, estimated listening time, and plain publishing status. Plot summaries, audit records, queue information, and per-episode controls stay in native single-open disclosures. Publishing remains a separate, unfolded section with its clearance verdict and existing controls; planning, scoring, source records, and the full story text remain in Reference. No production data was changed.

Research basis: [Spotify for Creators episode management](https://support.spotify.com/st-en/creators/article/publishing-a-saved-episode/) and [YouTube Studio content management](https://support.google.com/youtube/answer/17011221?hl=en), interpreted for this studio's existing data rather than adding invented engagement metrics. Desktop and 390px screenshots were reviewed. The full sweep caught a nested publishing disclosure; that extra layer was removed. Final full e2e run: **43 passed, 1 skipped** (opt-in recording walkthrough), in 3.5 minutes. Paid generation stayed disabled, and the user-owned publish state hash is unchanged. TypeScript reports only the three known `demo.spec.ts` timeout-literal errors.

Latest correction: **both episode and generated-audio counts are visible on every Shows card**, beneath the gist, and remain available on the individual series page. Counts are existing real values, including zero audio. Removed the card's outer padding and the oversized internal gap; the art surface now meets the card edge while the text retains readable spacing. Desktop and mobile screenshots were reviewed. The regression test also waits for series navigation before asserting destination counts, avoiding an ambiguous match against the eight library cards still on screen.

Implemented approved direction: **wide, shallow series cards with dimensional cover art and an always-visible gist beside the title**. The shared `SeriesCard` owns the entire surface and one navigation link. The library no longer has Series details disclosures, clearance labels, production counts, or artwork-replacing overlays. Cover dimensions are independent of card width. Desktop uses two columns at 1440px; phones retain a smaller cover beside wrapping text. Native links work without JavaScript. Motion affects only artwork and becomes flat with reduced motion. Existing deterministic cover placeholders and the real-art slot remain; no new model or network dependency was added.

Gists use the existing `hook()` excerpt of `oneLine` or `fantasy`, not the research concept's sample copy. Full story text remains under Story overview on the individual series page. Episodes written and distinct episodes with generated audio are now visible together on that page, with their existing data semantics preserved. All 15 focused studio tests pass; `tsc --noEmit` still reports only the three known demo timeout-literal errors. Desktop and mobile screenshots were reviewed.

User correction: removed **all clearance labels and clearance explanation copy from the Shows library**, including inside Series details. The actual clearance data and individual story screens are unchanged. Reverted the rejected cover overlay to a native inline disclosure; artwork is never replaced by text. This supersedes the quick-look treatment below. Regression checks explicitly assert absence of clearance copy from the library and details appearing below the cover.

Current library treatment: **cover quick look**, implemented as a `cover` variant of the shared native `Reveal`. Details replace the cover area temporarily without changing card height, pushing neighbouring cards, or opening a separate workspace. The title and unresolved clearance stay outside the sheet. Long content scrolls within the cover; all disclosure content remains in the DOM. Greenlight source clearance is recorded inside details rather than repeated as a badge on the production library.

Library motion is separate in `web/app/series-motion.css`: brief card entrance, quick-look reveal, and a restrained CSS perspective lift on pointer hover. Reduced-motion users get none of these effects. No Three.js dependency, model assets, client component, animation loop, or live network dependency was added; this is CSS depth, not a rendered 3D character. Test-first geometry failed against the old expanding cards, then passed with the fixed-size quick look. Desktop and phone screenshots were reviewed, including a corrected text contrast issue. All 14 focused studio checks pass, including no-JavaScript disclosure and reduced motion.

Latest refinement: **Series details expands inside its own card**, using the shared native `Reveal` and a single-open group. The right-hand panel and compact-row transformation are no longer used by the library. The summary remains keyboard-operable and the full library keeps its width. “Change the names” is now **Fictionalization required** consistently across clearance badges, with a visible explanation inside the affected series’ expansion. Badge text wraps and uses sentence case for the longer status.

The library panel is now labelled **Series details** and contains only a short story gist, episodes written, and audio generated, plus a link to the episodes. Audio counts deduplicate recognised, non-empty finished mixes by written episode; alternate languages/effects do not inflate the count. Publishing status is not used as an audio count. Detailed editorial records remain on the individual series pages.

- Full ordinary e2e sweep after the approved wide-card implementation: **41 passed, 1 skipped** (opt-in recording walkthrough), in 3.3 minutes. No retries were needed. Paid generation remained disabled.
- Desktop layout checks at 1280×800 and 1440×900 report no page overflow or clipped inner scrollers; the cast and comparison view also fit a 390px mobile viewport.
- Read-only playback tests cover real MP3 responses, seeking, mix switching and language switching.
- New regression checks cover free cast selection, native single-open detail groups, commissioning evidence disclosure, and every quoted violation in the control comparison.
- `tsc --noEmit` reports only the three previously documented timeout-literal errors in `demo.spec.ts`; no successful production build is claimed.
- `git diff --check` is clean. No paid generation, release, or rollback was executed during the sweep.
