/**
 * Renders a generated episode.
 *
 * The `.md` files are only nominally markdown — one `#` heading, then an audio
 * script: `SFX:` cues, `NARRATOR:` passages, and `SPEAKER: line`. Nothing else
 * appears in any of the fifty-six committed files, which is why there is no
 * markdown library here. A dependency that parses emphasis and tables would
 * still not know that a cue should be set differently from a line of dialogue,
 * and that distinction is the whole of the typography.
 */

type Block =
  | { kind: "cue"; text: string }
  | { kind: "narration"; text: string }
  | { kind: "line"; speaker: string; text: string }
  | { kind: "prose"; text: string };

// A speaker is upper-case, optionally qualified — `VOICE (process server):`.
const SPEAKER = /^([A-Z][A-Z0-9 .'’\-]*(?:\([^)]*\))?[A-Z0-9 .'’\-]*):\s*(.*)$/;

function parse(body: string): { title: string | null; blocks: Block[] } {
  let title: string | null = null;
  const blocks: Block[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      title ??= line.replace(/^#+\s*/, "");
      continue;
    }

    const m = line.match(SPEAKER);
    if (!m) {
      // No speaker prefix: either a continuation of the line above or stray
      // prose. Folding it into the previous line keeps the gutter aligned.
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind !== "prose") prev.text += ` ${line}`;
      else blocks.push({ kind: "prose", text: line });
      continue;
    }

    const speaker = m[1].trim();
    const text = m[2].trim();
    if (speaker === "SFX") blocks.push({ kind: "cue", text });
    else if (speaker === "NARRATOR") blocks.push({ kind: "narration", text });
    else blocks.push({ kind: "line", speaker, text });
  }

  return { title, blocks };
}

function Line({ block }: { block: Block }) {
  if (block.kind === "cue") {
    return (
      <p className="sm:col-start-2 text-sm text-faint italic leading-relaxed py-1">
        {block.text}
      </p>
    );
  }

  if (block.kind === "narration") {
    return (
      <>
        <p className="label sm:text-right sm:pt-1.5">Narrator</p>
        <p className="font-serif text-[1.0625rem] leading-[1.85] text-muted border-l border-rule-strong pl-5 py-1">
          {block.text}
        </p>
      </>
    );
  }

  if (block.kind === "prose") {
    return (
      <p className="sm:col-start-2 font-serif text-[1.0625rem] leading-[1.85]">
        {block.text}
      </p>
    );
  }

  return (
    <>
      <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-faint uppercase sm:text-right sm:pt-2">
        {block.speaker}
      </p>
      <p className="font-serif text-[1.0625rem] leading-[1.85] text-paper">
        {block.text}
      </p>
    </>
  );
}

export function EpisodeScript({ body }: { body: string }) {
  const { blocks } = parse(body);

  if (!blocks.length) {
    return (
      <p className="text-sm text-muted">
        This episode file is empty. Nothing was written to it.
      </p>
    );
  }

  return (
    // Speakers sit in a gutter so the eye returns to a single left edge for the
    // dialogue — the measure stays constant however long the name is.
    <div className="grid sm:grid-cols-[7rem_minmax(0,36rem)] gap-x-6 gap-y-3 items-baseline">
      {blocks.map((b, i) => (
        <Line key={i} block={b} />
      ))}
    </div>
  );
}

/** Audio drama runs near 150 words a minute; the estimate is deliberately coarse. */
export function listenMinutes(words: number): number {
  return Math.max(1, Math.round(words / 150));
}
