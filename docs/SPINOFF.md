# BUILDING A SPINOFF
### Worked example: Jignesh, from "The Century Hitters"

Five steps. Only two of them call an LLM.

---

## STEP 1 — QUERY (no LLM, ~10 lines of code)

Three filters over the mainline beat sheet.

```python
knows = [b for b in beats if "jignesh" in b.present + b.witnessed_by]
blind = [b for b in beats if "jignesh" in b.hidden_from]
gaps  = time_intervals_where(beats, char="jignesh", count=0)
```

For Jignesh:

**KNOWS (4 beats)**
- b004 — hired at ₹400/day, handed a Chennai Super Kings jersey
- b009 — first match played and streamed
- b014 — hits a clean six; umpire signals dot ball
- b022 — the raid, mid-match

**BLIND (11 beats)** — Russia exists. There is a man on a phone. Money is changing hands. There is a Telegram channel. Bhavlo's walkie-talkie has another end. Someone has tipped off a constable. Rafiq worked in a bar in Tver.

**GAPS** — the nights between matches, the walk back to the village, the four days when rain stopped play, the twelve hours before the raid.

That third list is where the spinoff actually lives. Canon says nothing there, so nothing there can be contradicted. **Absence is the writable space.**

---

## STEP 2 — PROMOTION CALL (one LLM call, fires on click)

```
Here is a side character from a serial, the beats he witnessed, the beats he is
excluded from, and the time windows where he does not appear.

CHARACTER: {{stub}}
WITNESSED: {{knows}}
EXCLUDED FROM: {{blind}}
ABSENT DURING: {{gaps}}

Produce:

1. WANT — what he is chasing, stated as an action not a feeling
2. WOUND — what he is avoiding, and what it costs him to keep avoiding it
3. VOICE — sentence length, deflection habit, what he says when frightened
4. ENGINE — the standing condition that generates conflict for him every
   episode. It must be different from the mainline engine. It must be
   permanently switched on.
5. OFFSCREEN LEDGER — for each absent window, what he was doing. Invent freely;
   canon is empty here.
6. THE REFRAME — the mainline serial is about X. State what HIS serial is about
   instead. If the answer is "the same thing from another angle," try again.
```

**Output for Jignesh:**

> **WANT** — to be handed the jersey again tomorrow.
>
> **WOUND** — he is the best cricketer in a village that has never produced one, which until now has meant nothing at all.
>
> **VOICE** — short sentences. Deflects with cricket technicalities when uncomfortable. Goes completely silent when frightened, which the others read as slowness.
>
> **ENGINE** — *He must not ask.* The ₹400 comes with one unspoken condition, and every single day he learns one more thing that makes not-asking harder. Permanently on, escalates by itself.
>
> **OFFSCREEN LEDGER** — Night 1: he tells his mother he's been picked for a tournament, and she believes him, and he lets her. Night 3: he practises alone after everyone's gone, because he wants to be good, not just present. Rain days: he keeps the jersey instead of returning it and sleeps in it. The night before the raid: he finally asks Bhavlo one question and gets an answer that isn't one.
>
> **THE REFRAME** — the mainline is a heist about whether the con holds. Jignesh's is about a boy who is not being conned and not conning anyone, being paid to lose deliberately at the only thing he has ever been good at.

---

## STEP 3 — CONSTRAINT SET (no LLM, string assembly)

Flatten `knows` into immutable lines, `blind` into a prohibition list. This gets injected into every generation call.

```
IMMUTABLE — these happened to him and cannot change:
- Hired at ₹400 per match. Handed a Chennai Super Kings jersey.
- Played and was livestreamed, without knowing he was livestreamed.
- Hit a clean six off the middle of the bat. The umpire signalled dot ball.
- Was on the field when the police arrived, mid-match.

HE DOES NOT KNOW, AND MAY NOT ACT AS IF HE KNOWS:
- That anyone is betting on this
- That Russia is involved in any way
- That Bhavlo's walkie-talkie connects to anyone
- That Rafiq has ever left Gujarat
- That a constable has been tipped off
- That any money beyond his ₹400 exists
```

---

## STEP 4 — GENERATE (one LLM call per episode batch)

Reuse the mainline system prompt unchanged — the audio grammar and the cut-early rule are the same. Append this:

```
POV LOCK. This serial is told from inside {{character}} only.

- Every scene must contain him. If he leaves, the scene ends.
- The listener may know more than he does, but only from the MAINLINE serial.
  You may never narrate information he does not have.
- The narrator here is not omniscient. The narrator is limited to his
  understanding, and may be WRONG about the wider plot. Let it be wrong.

CONSTRAINT SET: {{immutable}}
PROHIBITED KNOWLEDGE: {{blind}}
SET SCENES PRIMARILY IN: {{gaps}}

CROSSING POINTS. These beats appear in the mainline. When you reach one, the
objective facts must match exactly — same action, same words spoken aloud, same
outcome. Everything else is yours: what he thought it meant, what he noticed,
what it cost him. The mainline gave this beat 20 seconds. Give it an episode.

CROSSINGS: {{shared_beats}}

CLIFFHANGER LADDER — his is internal, not plot-driven:
  Ep 1 — WONDER:      something small is off and he decides not to think about it
  Ep 2 — RATIONALISE: he explains it away, convincingly, to himself
  Ep 3 — EVIDENCE:    he can no longer explain it away
  Ep 4 — THE SIX:     the crossing point. He understands he is paid to lose.
  Ep 5 — ASKING:      he asks. The answer is worse than the silence was.
```

---

## STEP 5 — WRITE BACK + VALIDATE

New beats commit as `tier: branch_canon`, `pov: jignesh`. They may reference core beats but never mutate them. Default `hidden_from` on a branch beat = every mainline character, unless you explicitly place someone there — this stops branches leaking into each other.

Then one validator call:

```
Given this constraint set and these scripts, report ONLY:
1. Any line where the character demonstrates knowledge of a PROHIBITED item.
   Quote it, name the item.
2. Any crossing point where objective facts differ from the mainline beat.
   Quote both.
Output JSON. Empty array if clean.
```

---

## THE DEMO MOVE

Beat **b014** in the mainline is one line: *the umpire signals a dot ball on a clean six.* Twenty seconds. It exists to show the con working.

In Jignesh's spinoff it is the entire fourth episode.

Same objective fact. Opposite meaning. Zero contradictions — and you can put the two scripts side by side on screen with the validator green between them.

That is the whole product in one slide, and it's the thing nobody else in the room will be able to show.
