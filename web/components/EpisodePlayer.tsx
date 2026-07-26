"use client";

import { useRef, useState } from "react";

import type { AudioTrack } from "@/lib/audio";
import {
  LANGUAGE_HEADING,
  MIX_EXPLAINED,
  MIX_HEADING,
  VOICES_ONLY,
  WITH_EFFECTS,
  languageName,
  languagesExplained,
  runningTime,
} from "./audioWords";

/**
 * The player, and the only client component in the audio block.
 *
 * It exists because switching between mixes is interaction: the four files for
 * one episode are the same performance in two languages, each with and without
 * spot effects, and choosing between them is a decision a listener makes with
 * the audio running. Everything else about the episode's audio — what direction
 * it carries, whether it was directed at all — is fixed at read time and stays
 * on the server.
 *
 * Position is preserved across an effects toggle and deliberately not across a
 * language change. The two mixes of one language are the same timeline, so
 * dropping the listener back to zero mid-sentence would make the toggle
 * unusable for the only thing it is for, which is hearing the difference at the
 * same moment. Two languages are two performances of different lengths, and
 * carrying 40 seconds across lands somewhere unrelated.
 */

interface Choice {
  language: string;
  soundEffects: boolean;
}

/** What to restore after the element remounts on a new source. */
interface Resume {
  at: number;
  playing: boolean;
}

function pick(tracks: AudioTrack[], choice: Choice): AudioTrack | null {
  const inLanguage = tracks.filter((t) => t.language === choice.language);
  // Falls back within the language before giving up: an episode voiced in one
  // language with only the effects mix on disk should still play when somebody
  // asks for voices only, rather than going silent.
  return (
    inLanguage.find((t) => t.soundEffects === choice.soundEffects) ??
    inLanguage[0] ??
    tracks[0] ??
    null
  );
}

function Toggle({
  on,
  label,
  title,
  onClick,
}: {
  on: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`label px-3 py-1.5 border rounded-sm transition-colors ${
        on
          ? "border-ochre/60 text-ochre bg-ochre/10"
          : "border-rule text-muted hover:text-paper hover:border-rule-strong"
      }`}
    >
      {label}
    </button>
  );
}

export function EpisodePlayer({ tracks }: { tracks: AudioTrack[] }) {
  const languages = [...new Set(tracks.map((t) => t.language))];

  const [choice, setChoice] = useState<Choice>(() => ({
    language: languages[0] ?? "",
    // The fuller mix is the product. Somebody opening this should hear what a
    // listener would hear, not the stem it was built from.
    soundEffects: tracks.some((t) => t.soundEffects),
  }));

  const audio = useRef<HTMLAudioElement>(null);
  const resume = useRef<Resume | null>(null);

  const track = pick(tracks, choice);
  if (!track) return null;

  const inLanguage = tracks.filter((t) => t.language === choice.language);
  const bothMixes =
    inLanguage.some((t) => t.soundEffects) && inLanguage.some((t) => !t.soundEffects);

  function switchMix(soundEffects: boolean) {
    const el = audio.current;
    if (el) resume.current = { at: el.currentTime, playing: !el.paused };
    setChoice((c) => ({ ...c, soundEffects }));
  }

  function switchLanguage(language: string) {
    // Two performances, two lengths. Nothing to carry across.
    resume.current = null;
    setChoice((c) => ({ ...c, language }));
  }

  function restore() {
    const el = audio.current;
    const r = resume.current;
    resume.current = null;
    if (!el || !r) return;
    // `duration` is NaN until metadata lands; this fires after it, but a mix
    // that ends fractionally shorter would otherwise throw on seek.
    if (Number.isFinite(el.duration)) el.currentTime = Math.min(r.at, el.duration);
    else el.currentTime = r.at;
    if (r.playing) void el.play().catch(() => {});
  }

  const length = runningTime(track.durationMs);
  const languagesNote = languagesExplained(languages.length);

  return (
    <div className="border border-rule bg-surface p-6">
      {/* Keyed on the source so React remounts the element rather than leaving
          a stale buffer behind — changing `src` on a live media element does
          not reload it without an explicit load() call. */}
      <audio
        key={track.url}
        ref={audio}
        src={track.url}
        controls
        preload="metadata"
        onLoadedMetadata={restore}
        className="w-full"
      />

      <div className="mt-5 flex flex-wrap items-start gap-x-10 gap-y-5">
        {languages.length > 1 && (
          <div>
            <div className="label mb-2">{LANGUAGE_HEADING}</div>
            <div className="flex flex-wrap gap-2">
              {languages.map((code) => (
                <Toggle
                  key={code}
                  on={code === choice.language}
                  label={languageName(code)}
                  title={languageName(code)}
                  onClick={() => switchLanguage(code)}
                />
              ))}
            </div>
          </div>
        )}

        {bothMixes && (
          <div>
            <div className="label mb-2">{MIX_HEADING}</div>
            <div className="flex flex-wrap gap-2">
              <Toggle
                on={!track.soundEffects}
                label={VOICES_ONLY.label}
                title={VOICES_ONLY.plain}
                onClick={() => switchMix(false)}
              />
              <Toggle
                on={track.soundEffects}
                label={WITH_EFFECTS.label}
                title={WITH_EFFECTS.plain}
                onClick={() => switchMix(true)}
              />
            </div>
          </div>
        )}
      </div>

      <p className="label mt-5">
        {[
          languageName(track.language),
          track.soundEffects ? WITH_EFFECTS.label : VOICES_ONLY.label,
          length,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <p className="text-sm text-muted leading-relaxed mt-2 prose-col">
        {[MIX_EXPLAINED, languagesNote].filter(Boolean).join(" ")}
      </p>
    </div>
  );
}
