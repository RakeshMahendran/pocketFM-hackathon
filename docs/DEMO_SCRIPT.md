# Three minutes

One story, one screen recording, five beats. Every number below is on disk — if
a rehearsal shows a different one, the data moved and the script is wrong, not
the app.

Sign in as **Priya Raghavan**. Set `CANONFORGE_STORIES=evt_gandhinagar_tribunal`
so the slate holds one show and nothing invites a detour.

---

## 0:00 – 0:20 · The problem

*No screen yet, or the slate.*

> Audio platforms make money per unlocked episode. So every finished serial is a
> problem: forty side characters, each one a story you already paid to build the
> world for — and no way to reach them without a writers' room re-reading
> everything and still contradicting canon by episode three.
>
> This finds real events worth adapting, turns one into a season, and then turns
> anyone standing at the edge of it into a season of their own.

**Say nothing you cannot show.** The next two and a half minutes are the proof.

---

## 0:20 – 0:45 · What it found  → `/sourcing`

> Twenty-nine real events. Not keyword matches — it searches for *mechanism*: a
> lie that has to be maintained daily, an identity nobody can prove. The strange
> local case that never made national news is usually the better source.
>
> Every one is graded, and every one carries a legal read.

*Click the demo story.* On the brief, land on the clearance line and read it:

> **Change the names.** *Real, recent, and involves living people who never asked
> to be in a show.*

Do not tour the ratings. They are 39–47 out of 50 across all 29 and the spread
says nothing; a judge who reads them closely will find that out, and it is not
what you are selling.

---

## 0:45 – 1:15 · The season  → `/serials/evt_gandhinagar_tribunal`

> A man the bar council struck off rented an office, called it a tribunal, and
> passed judgment on other people's land for five years. Twelve episodes.
>
> But the episodes are not the output. Underneath every one is a record of every
> moment in the season — what happened, who was in the room, and **who was kept
> in the dark**.

That last field is the product. Say it once, here, and do not repeat it.

---

## 1:15 – 1:40 · Hear it  → `/serials/evt_gandhinagar_tribunal/1`

*Press play. Let ten to fifteen seconds run — do not talk over the first line.*

> Every part is cast and voiced separately, laid against a mood bed and mastered
> as one episode. How each line is played was decided **after** the whole episode
> existed — an opening can only be pitched against an ending once there is one.

*Point at the emotion and pace spread.* This is the only beat where silence is
better than narration. Let it play.

---

## 1:40 – 2:40 · The claim  → `/cast` → `manjula` → her episode

The minute the whole thing is for. Do not rush it.

> Twelve characters. Ten of them could carry a show — because each one is
> defined by what they were **not** told.

*Open Manjula.*

> A widow who wins her father's land in that court. She saw **five** moments of
> this season. She was shut out of **forty-four**. That gap is the story.

*Open her episode.*

> Her own episode, written only from what she knows. And then checked against the
> season it came from — six passes: three looking for contradictions, three more
> trying to prove the first three missed something.
>
> **Zero contradictions.**

*Open "What it tried, and could not make stick".* **This is the beat that wins
it.**

> Fifteen things the check attacked and could not land. Including this one — it
> went looking for her knowing about Morris's arrest, the thing she is blind to,
> and found nothing.

A green tick proves nothing. A list of failed attacks proves the check has teeth.

---

## 2:40 – 3:00 · The refusal  → back to the season

*Scroll to the publish panel. It is red.*

> And we cannot ship this one.
>
> It names a living man who has been arrested and not convicted. The system
> refuses to publish it — **not by us, not by anyone**. Continuity and clearance
> are what this sells, and a rule that bends under deadline is not a rule.

Stop there. Do not offer to fix it.

---

## What not to show

- **The 0-vs-5 comparison on Ratnamma.** All five findings cite one beat, and one
  of them flags a clerk reading Ratnamma her own pension order *to her face* —
  a character being told something, not knowing something they shouldn't. A
  judge who reads the five will see it. Manjula's fifteen ruled-out attacks are
  the stronger and safer proof.
- **Live generation.** Four minutes and real money. If asked, say it is one click
  and show `--replay`, which walks the real stages against work already on disk
  in about three seconds and says so.
- **The candidate scores.** Flat.
- **Any character who is not Manjula, Ratnamma or Babulal.** The console reports
  `blind` as everything a character did not witness, which overstates recorded
  ignorance on characters nobody has tightened by hand.

## Before you record

```bash
python tasks.py publish --story story1_denied_identity --status   # expect 3 of 14
python -m pytest tests/ -q                                        # expect 367 passed
```

Run the browser in a **clean profile**. A DOM-mutating extension — Grammarly, a
password manager — produces a React hydration error in devtools that looks
exactly like a bug in this app and is not.
