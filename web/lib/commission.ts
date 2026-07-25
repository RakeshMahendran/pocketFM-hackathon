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
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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
  return {
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

  const existing = await readCommission(eventId);
  // Already under way: show it rather than starting a second one over the top.
  if (existing?.state !== "running") {
    const child = spawn(
      "python",
      ["-m", "src.commission", "--event", eventId],
      { cwd: REPO, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
  }

  redirect(`/commissioning/${encodeURIComponent(eventId)}`);
}
