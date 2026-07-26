/**
 * ===========================================================================
 * TEMPORARY HOME — every string in this file belongs in `lib/words.ts`.
 * ===========================================================================
 *
 * `words.ts` is the single source of truth for what the console says, and it is
 * being edited by another track right now. Rather than reach into a file
 * somebody else has open, the audio half's wording sits here, written to the
 * same rules, so that moving it later is one cut and one import change.
 *
 * The rules it is written to, from `words.ts` itself:
 *
 *  - The reader is a commissioning editor, not an engineer. Nothing on screen
 *    may be a field value. `hi-en`, `sfx`, `bgm_cue`, `intensity`, `l004` and
 *    filenames are all banned from the surface — they exist in `lib/audio.ts`
 *    where precision matters, and are translated here.
 *  - Where a distinction changes what somebody would do, it gets its own words.
 *    "Directed" and "not directed" are the load-bearing pair in this file: a
 *    flat episode dressed up as a performed one is a lie the product cannot
 *    afford, so the undirected case says plainly that the pass never ran.
 */

/** One label with one sentence under it — the shape `words.ts` uses throughout. */
export interface Said {
  label: string;
  plain: string;
}

// ---------------------------------------------------------------------------
// THE SECTION ITSELF
// ---------------------------------------------------------------------------

export const LISTEN_TITLE = "Listen";

/** When nothing has been voiced. Not an error, and it should not look like one. */
export const NO_AUDIO: Said = {
  label: "Not recorded yet",
  plain:
    "This episode is written but has not been through the studio. Nothing has been voiced, so there is nothing to play.",
};

/** Sits under the player once. What a listener is actually hearing. */
export const MIX_EXPLAINED =
  "Every part is voiced separately, laid against a mood bed, and mastered as one episode.";

// ---------------------------------------------------------------------------
// LANGUAGES
//
// The pipeline writes `en` and `hi-en`. `hi-en` is Hinglish — Hindi as the
// spoken base with English where English is what would actually be said in the
// room — and "Hindi-English" is the register a commissioning team uses for it.
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  "hi-en": "Hindi-English",
  ta: "Tamil",
  "ta-en": "Tamil-English",
};

export function languageName(code: string): string {
  // A code with no name is a language somebody added upstream this morning.
  // Better an honest blank than a raw token on screen.
  return LANGUAGE_NAMES[code] ?? "Another language";
}

export const LANGUAGE_HEADING = "Language";

export function languagesExplained(count: number): string {
  return count > 1
    ? `The same episode voiced ${count} times over, cast separately in each.`
    : "";
}

/**
 * The languages a recording can be ordered in — the five `src/audio/build.py`
 * accepts, named rather than coded.
 *
 * English first because it is the register every season on disk is written in;
 * the rest in the order the pipeline lists them. `lib/audio-run.ts` keeps its
 * own copy of the five codes and checks against that, because what a form is
 * allowed to send is a question for the thing that spawns the process, not for
 * the file that decides how to spell it on screen.
 */
export const RECORDABLE_LANGUAGES = ["en", "hi-en", "hi", "ta", "ta-en"];

// ---------------------------------------------------------------------------
// SOUND EFFECTS
//
// Two mixes of the same performance: the voices over their mood bed, and the
// same thing with spot effects laid in at each line. Never the word "sfx".
// ---------------------------------------------------------------------------

export const MIX_HEADING = "Sound";

export const WITH_EFFECTS: Said = {
  label: "With sound effects",
  plain:
    "Individual sounds placed at the moment each line lands — a stamp coming down, a corridor of people breathing. Written into the script and generated, because no library has them.",
};

export const VOICES_ONLY: Said = {
  label: "Voices only",
  plain: "The performance over its mood bed, with nothing laid on top.",
};

// ---------------------------------------------------------------------------
// HOW IT IS PERFORMED
//
// The distinction this whole block exists for. `src/audio/director.py` is the
// only stage that decides emotion, pace and level, and it runs after the
// episode is written — a line cannot be pitched against an ending the writer
// has not reached. An episode that never went through it is `neutral 0.5` on
// every line, which is not a neutral read, it is a flat one.
//
// So there are two headings, not one label with a caveat. An editor glancing at
// this must be able to tell a performed episode from an unperformed one without
// reading a word of the detail.
// ---------------------------------------------------------------------------

export const DIRECTED: Said = {
  label: "Performed",
  plain:
    "How every line is played was decided after the whole episode existed, not while it was being written — an opening can only be pitched against an ending once there is an ending to pitch it against.",
};

export const UNDIRECTED: Said = {
  label: "Not performed yet",
  plain:
    "Every line in this episode sits at the same setting, because the performance pass has never been run on it. That is not a neutral read, it is a flat one — the same number drives the delivery, the music under it and how loud it sits in the mix.",
};

export function directionSaid(directed: boolean): Said {
  return directed ? DIRECTED : UNDIRECTED;
}

/** Only shown on a performed episode. Said as a count of decisions, not rows. */
export function directionCounts(lines: number, emotions: number, paces: number): string {
  return `${lines} lines, played ${emotions} different ways at ${paces} different speeds.`;
}

/** Said on a flat episode, with the number that makes it undeniable. */
export function flatCount(lines: number): string {
  return `All ${lines} lines are set identically.`;
}

export const EMOTION_HEADING = "How it is played";
export const PACE_HEADING = "How fast";
export const CAST_HEADING = "Cast";

/** "3 voices across 3 speaking parts" — casting, which is not direction. */
export function castLine(voices: number, speakers: number): string {
  const v = `${voices} ${voices === 1 ? "voice" : "voices"}`;
  const s = `${speakers} speaking ${speakers === 1 ? "part" : "parts"}`;
  return `${v} across ${s}`;
}

/**
 * Casting is counted separately from direction and never sold as it. The one
 * unperformed episode on disk has twelve voices in it; a voice count printed
 * beside a performance heading would read as evidence of craft that is not
 * there.
 */
export const CAST_IS_NOT_DIRECTION =
  "Casting is decided when the script is converted. It happens whether or not anybody has directed the performance.";

// ---------------------------------------------------------------------------
// THE EMOTIONS AND PACES THEMSELVES
//
// These come off the manifest as the pipeline's own enum. Every one is an
// ordinary English word already, apart from `hurt_anger`; the map exists so
// that an underscore never reaches the screen and so a value added upstream
// degrades to something readable rather than to a token.
// ---------------------------------------------------------------------------

const EMOTION_NAMES: Record<string, string> = {
  neutral: "Level",
  joy: "Joy",
  sorrow: "Sorrow",
  hurt_anger: "Hurt anger",
  fear: "Fear",
  tenderness: "Tenderness",
  tension: "Tension",
  sarcasm: "Sarcasm",
  hesitation: "Hesitation",
  urgency: "Urgency",
  reflective: "Reflective",
  relief: "Relief",
  longing: "Longing",
};

const PACE_NAMES: Record<string, string> = {
  slow: "Slow",
  normal: "Steady",
  clipped: "Clipped",
  fast: "Fast",
};

function humanise(raw: string): string {
  const words = raw.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function emotionName(raw: string): string {
  return EMOTION_NAMES[raw] ?? humanise(raw);
}

export function paceName(raw: string): string {
  return PACE_NAMES[raw] ?? humanise(raw);
}

// ---------------------------------------------------------------------------
// THE A/B PAIR
//
// The director may re-punctuate a line — add a stammer, break a sentence — but
// never change a word, because the audio would then disagree with the script
// and with the canon beats. The pair is the proof that the difference is worth
// having: same words, twice.
// ---------------------------------------------------------------------------

export const COMPARISON_HEADING = "The same words, performed two ways";

export const COMPARISON_EXPLAINED =
  "Not a rewrite. The director is refused any change to what a character says — only to how it is said. This is the whole of what that second pass buys.";

export const AS_WRITTEN: Said = {
  label: "As written",
  plain: "Straight off the page, before anybody decided how to play it.",
};

export const RESHAPED: Said = {
  label: "After direction",
  plain:
    "The same words, broken and paced for performance rather than for reading.",
};

/**
 * Shown when the pair sits beside an episode that was never performed — which
 * is exactly where it sits today. Without this line the screen offers a
 * before-and-after directly under a heading saying the pass never ran, and a
 * reader is entitled to conclude the full episode above is the "after". It is
 * not. The pair is a test on a short stretch of the same material.
 */
export const PAIR_ON_UNPERFORMED =
  "This pair is a short stretch of this episode, run through that pass on its own. The full episode above has not been — it is the flat version, and this is what it stands to gain.";

// ---------------------------------------------------------------------------
// COUNTS AND MEASURES
// ---------------------------------------------------------------------------

/** "4 min 17 s". Formatted here so the server and the browser agree on it. */
export function runningTime(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (!minutes) return `${seconds} s`;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/**
 * Audio in the directory this console could not place against an episode. Said
 * so a file that exists is never silently disowned, and worded as something to
 * look at rather than as a fault.
 */
export function unplacedNote(n: number): string {
  return `${n} more ${n === 1 ? "recording is" : "recordings are"} filed here under a name this screen does not recognise, so ${n === 1 ? "it is" : "they are"} not offered above.`;
}

// ---------------------------------------------------------------------------
// ORDERING A RECORDING
//
// The console could already commission a season and give a side character their
// own episode. Recording was the one stage with no control at all — five of the
// seven seasons on disk have no audio, so most episode pages said "Not recorded
// yet" and offered the reader nothing to do about it.
//
// The rule this block is written to is the one `spinoffRunWords.ts` states: what
// a button is about to spend has to be readable before it is pressed. Recording
// is minutes of a paid text-to-speech provider — unless the machine is replaying
// clips it has already made, in which case saying otherwise is false and teaches
// a producer to ignore the warning the one time it is true.
// ---------------------------------------------------------------------------

export const RECORD_HEADING = "Record it";

/** The button, before anything has been voiced. */
export const RECORD_ACTION = "Record this episode";

/** The button when a recording already exists. Never the loud option. */
export const RECORD_AGAIN_ACTION = "Record it again";

/** Between the click and the page coming back. Starting is quick; the run is not. */
export const RECORD_STARTING = "Starting…";

/** The quiet disclosure a re-record sits behind, so the player stays primary. */
export const RECORD_AGAIN_SUMMARY = "Record this episode again";

/** The honest version on a machine wired to the provider. */
export const RECORD_COSTS_MONEY =
  "Every line is sent to a text-to-speech provider, so this costs credits and takes several minutes. You can leave the page while it works — nothing is lost if you close it.";

/** The honest version on a machine replaying clips it has already made. */
export const RECORD_COSTS_NOTHING =
  "This machine replays lines that have already been recorded rather than calling the provider, so it costs nothing and comes back almost at once.";

/**
 * What the button is about to do, said above it rather than behind it.
 *
 * The two cases are genuinely different work: a first recording produces
 * something where there was nothing, and a second one runs the same three
 * stages over the top of a mix somebody may already have listened to.
 */
export function recordWhatItWillDo(o: {
  recorded: boolean;
  offline: boolean;
}): string {
  const work = o.recorded
    ? "This runs from the script again: how every line is played is decided afresh, the parts are voiced, and the episode is mixed from the top."
    : "This reads the script back, gives every part a voice, decides how each line is played, then records it and mixes the finished episode.";
  return `${work} ${o.offline ? RECORD_COSTS_NOTHING : RECORD_COSTS_MONEY}`;
}

// --- which language to record ---------------------------------------------

export const RECORD_LANGUAGE_HEADING = "Record it in";

/**
 * Said only where a recording already exists, because it is only there that the
 * choice changes what happens to what is on disk. A language already recorded is
 * overwritten; any other is a second cut that sits beside the first.
 */
export const RECORD_LANGUAGE_REPLACES =
  "A language already recorded is replaced by this. Any other is recorded fresh and sits beside the ones already here, as a separate cut of the same episode.";

/** "English and Hindi-English are recorded." Names, never codes. */
export function alreadyRecorded(names: string[]): string {
  if (!names.length) return "";
  const listed =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed} ${names.length === 1 ? "is" : "are"} already recorded.`;
}

// --- the three stages ------------------------------------------------------

/**
 * Three, and deliberately coarse. `src/audio/build.py` logs very little, so the
 * run infers its stage from what the build actually said; inventing five finer
 * ones would be a bar claiming to know something nothing measured.
 *
 * The labels are the run's own, verbatim, because the screen shows all three at
 * once and the two not running have no label coming from anywhere. A list where
 * one row is worded by the backend and two by the console reads as three voices.
 */
export interface RecordStep {
  /** Matches the `step` the run writes. Never rendered. */
  key: string;
  label: string;
  /** What that stage means, for whoever is watching it happen. */
  means: string;
}

export const RECORD_STEPS: RecordStep[] = [
  {
    key: "converting",
    label: "Reading the script and deciding the performance",
    means:
      "The script becomes a running order of separate lines, each part is given a voice, and how every line should be played is settled before a word of it is recorded.",
  },
  {
    key: "voicing",
    label: "Recording the lines",
    means:
      "Each line is spoken on its own by the voice cast for that part. This is the long stretch, and the only one that spends anything.",
  },
  {
    key: "mastering",
    label: "Laying the effects and levelling it",
    means:
      "The performance is set against its mood bed, individual sounds are placed at the moment each line lands, and the whole episode is levelled as one piece.",
  },
];

/** Against the stage being worked on right now. */
export const RECORD_STEP_UNDER_WAY = "under way";

/** Against the stage a failed run got as far as. */
export const RECORD_STEP_STOPPED = "stopped here";

// --- while it runs, and after ----------------------------------------------

export const RECORD_RUN_HEADING = {
  running: "Being recorded now",
  failed: "It stopped part-way",
  done: "Recorded",
};

/** Why the screen is moving on its own. The same promise the season page makes. */
export const RECORD_UNDER_WAY =
  "Recording takes several minutes. The page keeps itself up to date, so you can leave it open or come back later — nothing is lost if you close it.";

export const RECORD_WHAT_WENT_WRONG = "What went wrong";

/**
 * The reassurance that has to come with any failure here. Recording only ever
 * writes audio, so a run that fell over cannot have moved a word of the script
 * or a beat of the canon — and the clip cache means the lines it did get through
 * are not paid for a second time.
 */
export const RECORD_FAILED =
  "Nothing written was touched — the script and the season are exactly as they were, and a half-finished mix is not kept. Starting it again runs from the top, and any line already recorded is reused rather than paid for twice.";

export const RECORD_TRY_AGAIN = "Start it again";

/**
 * A run that finished with nothing playable beside it. Rare, and worth saying
 * plainly rather than falling back to "not recorded yet", which would send
 * somebody to spend the credits a second time for the same result.
 */
export const RECORD_DONE_BUT_NOTHING_HERE =
  "The recording finished, but no finished mix has appeared for this episode. Whoever set this machine up needs to look at where the studio is writing to — recording it again will land in the same place.";

/** Above the last thing the build said. Not a stage; the run's own words. */
export const RECORD_LAST_SAID = "Where it has got to";

/**
 * The last line the build logged, made fit to read.
 *
 * The build's log is written for whoever maintains it: it carries file paths,
 * line ids, provider tags and the abbreviations this file exists to keep off
 * the screen. Those tokens are dropped rather than the whole line, because the
 * point of carrying this at all is that a run which stalls shows where — and a
 * stalled run showing nothing is the failure this was meant to fix.
 *
 * A line with nothing readable left in it comes back null, and the screen simply
 * does not show one.
 */
const NOT_FOR_THE_SURFACE: RegExp[] = [
  /[\\/]/, // any path, absolute or relative
  /\.(?:mp3|wav|json|py|md|txt)$/i, // a filename
  /^l\d+$/i, // a line id
  /^(?:sfx|bgm|dbtp|tts)$/i, // the abbreviations, spelled out elsewhere
  /_KEY$/, // an environment variable
  /^(?:->|\|)$/, // log punctuation, meaningless on its own
];

/**
 * Words that cannot end a sentence. Dropping a filename off the end of
 * "wrote data/…/ep01.json" leaves "wrote" hanging, which reads as though the
 * screen lost something rather than withheld it.
 */
const HANGING = new Set([
  "wrote",
  "writing",
  "to",
  "at",
  "in",
  "into",
  "from",
  "of",
  "for",
  "is",
  "are",
  "and",
  "the",
]);

export function buildSaid(raw: string | null): string | null {
  if (!raw) return null;
  const kept = raw
    // Pipeline tags: `[bgm]`, `[cache hit]`, `[FAILED]`.
    .replace(/\[[^\]]*\]/g, " ")
    .split(/\s+/)
    .filter((token) => {
      const core = token.replace(/^[^\w]+|[^\w]+$/g, "");
      if (!core) return false;
      return !NOT_FOR_THE_SURFACE.some((p) => p.test(core) || p.test(token));
    });

  while (
    kept.length &&
    HANGING.has(kept[kept.length - 1].replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase())
  ) {
    kept.pop();
  }

  const said = kept
    .join(" ")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/[\s:;,-]+$/, "")
    .trim();
  // Three letters running is the cheapest test for "a word survived".
  return /[a-z]{3}/i.test(said) ? said : null;
}
