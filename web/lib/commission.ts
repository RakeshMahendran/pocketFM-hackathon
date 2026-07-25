"use server";

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

import { redirect } from "next/navigation";

import { DATA_DIR } from "./data";

/**
 * Starting a commission, and reporting on one already running.
 *
 * Writing a season is a dozen paid model calls over several minutes. Holding
 * the request open for that would time out, and a button that hangs reads as a
 * broken button — so this starts a detached process and hands the reader a page
 * that watches a status file the Python side keeps updated.
 *
 * The repo root is the web root's parent. Everything here runs server-side only.
 */

const REPO = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

export type CommissionState = "running" | "done" | "failed";

export interface Commission {
  eventId: string;
  storyId: string | null;
  /** The dossier's own id, minted by the planner. Null until planning finishes. */
  dossierEventId: string | null;
  state: CommissionState;
  step: string | null;
  /** What to show a person: "Working out the season", "Writing the episodes". */
  label: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  /** Known once the plan exists, so the screen can say "of 14" from the start. */
  totalEpisodes: number | null;
  /**
   * Per batch, not per episode — a batch is one call and nothing comes back
   * until it returns, so finer progress than this would be invented.
   */
  progress: {
    written: number;
    total: number;
    batch: number;
    batches: number;
    fromEp: number;
    toEp: number;
  } | null;
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** `serial_<story>_<start>_<end>_<hash>.json`, written once a batch returns. */
const BATCH_FILE = /^serial_(.+)_(\d+)_(\d+)_[0-9a-f]+\.json$/;

/**
 * Work out progress from what is on disk.
 *
 * The runner reports after each batch, but a run started before that existed
 * reports nothing, and a status file can also be caught mid-write. The cached
 * responses are the same evidence by another route: one file appears per batch
 * that came back, and the episode range is in its name.
 *
 * Derived rather than trusted, so it also corrects a status file that has gone
 * stale because the process died between a batch and its write.
 */
async function progressFromDisk(
  storyId: string,
  dossierEventId: string | null,
): Promise<{ written: number; total: number; fromEp: number; toEp: number } | null> {
  let names: string[];
  try {
    names = await fs.readdir(path.join(DATA_DIR, "cache", "calls"));
  } catch {
    return null;
  }

  const spans = names
    .map((n) => BATCH_FILE.exec(n))
    .filter((m): m is RegExpExecArray => m !== null && m[1] === storyId)
    .map((m) => ({ from: Number(m[2]), to: Number(m[3]) }))
    .sort((a, b) => a.from - b.from);

  if (!spans.length) return null;
  const written = Math.max(...spans.map((s) => s.to));

  // The plan knows the season length. Without it a count has no denominator,
  // and "12 written" alone does not tell anyone how far along that is.
  let total = written;
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(DATA_DIR, "dossiers.json"), "utf-8"),
    );
    const list = Array.isArray(raw) ? raw : [];
    const match =
      list.find((d) => asRecord(d).event_id === dossierEventId) ?? list[list.length - 1];
    const season = asRecord(match).season;
    if (Array.isArray(season) && season.length) total = season.length;
  } catch {
    // No plan readable: report what is written without inventing a target.
  }

  const last = spans[spans.length - 1];
  return { written, total, fromEp: last.from, toEp: last.to };
}

export async function readCommission(eventId: string): Promise<Commission | null> {
  let raw: string;
  try {
    raw = await fs.readFile(
      path.join(DATA_DIR, "commissions", `${eventId}.json`),
      "utf-8",
    );
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Caught mid-write. Not an error — the next poll gets a whole file.
    return null;
  }

  const r = asRecord(parsed);
  const state = str(r.state);

  const storyId = str(r.story_id) ?? eventId;
  const dossierEventId = str(r.dossier_event_id);

  const p = asRecord(r.progress);
  const written = int(p.written);
  const total = int(p.total);
  let progress =
    written !== null && total !== null
      ? {
          written,
          total,
          batch: int(p.batch) ?? 0,
          batches: int(p.batches) ?? 0,
          fromEp: int(p.from_ep) ?? 0,
          toEp: int(p.to_ep) ?? 0,
        }
      : null;

  if (!progress) {
    const derived = await progressFromDisk(storyId, dossierEventId);
    if (derived) {
      progress = { ...derived, batch: 0, batches: 0 };
    }
  }

  return {
    totalEpisodes: int(r.total_episodes) ?? progress?.total ?? null,
    progress,
    eventId,
    storyId: str(r.story_id),
    dossierEventId: str(r.dossier_event_id),
    state:
      state === "done" || state === "failed" ? state : "running",
    step: str(r.step),
    label: str(r.label),
    error: str(r.error),
    startedAt: str(r.started_at),
    updatedAt: str(r.updated_at),
  };
}

/**
 * Fire and forget. `detached` plus `unref` means the season keeps being written
 * after the request that started it has returned — otherwise Next tearing down
 * the handler would take the run with it.
 */
export async function startCommission(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/sourcing");

  // How many episodes the editor ordered. Bounded here rather than trusted:
  // this arrives from a form and ends up as an argument to a paid process.
  const asked = Number(formData.get("episodes"));
  const episodes =
    Number.isFinite(asked) && asked >= 1 && asked <= 60 ? Math.round(asked) : 14;

  const existing = await readCommission(eventId);
  // Already under way: show it rather than starting a second one over the top.
  if (existing?.state !== "running") {
    const child = spawn(
      "python",
      ["-m", "src.commission", "--event", eventId, "--episodes", String(episodes)],
      { cwd: REPO, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
  }

  redirect(`/commissioning/${encodeURIComponent(eventId)}`);
}
