"use server";

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import { revalidatePath } from "next/cache";

import { DATA_DIR } from "./data";
import { getEditor } from "./session";

const run = promisify(execFile);
const REPO = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

/**
 * Publishing, and the check that stands in front of it.
 *
 * Unlike commissioning this is fast — grading a beat sheet is arithmetic, no
 * model call — so it runs synchronously and the reader gets an answer rather
 * than a progress page.
 *
 * The check is deliberately re-run by Python rather than reimplemented here.
 * `validate_output` is the definition of what a sound season is; a second
 * implementation in TypeScript would drift from it, and the drift would show up
 * as a season the console calls fine and the pipeline refuses.
 */

export interface PublishState {
  live: boolean;
  by: string | null;
  at: string | null;
}

export interface Checks {
  fatal: string[];
  advisory: string[];
}

export async function readPublishState(storyId: string): Promise<PublishState> {
  try {
    const raw = JSON.parse(
      await fs.readFile(
        path.join(DATA_DIR, "stories", storyId, "publish.json"),
        "utf-8",
      ),
    );
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      live: r.state === "live",
      by: typeof r.by === "string" ? r.by : null,
      at: typeof r.at === "string" ? r.at : null,
    };
  } catch {
    // No file is the normal case: a season is a draft until somebody says so.
    return { live: false, by: null, at: null };
  }
}

/** Reads the checker's log. Exit code 1 means fatal problems, not a crash. */
export async function readChecks(storyId: string): Promise<Checks> {
  let output = "";
  try {
    const { stdout, stderr } = await run(
      "python",
      ["-m", "src.publish", "--story", storyId, "--check"],
      { cwd: REPO, timeout: 30_000 },
    );
    output = `${stdout}\n${stderr}`;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    if (e.stdout === undefined && e.stderr === undefined) {
      return { fatal: [], advisory: [] };
    }
    output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }

  const fatal: string[] = [];
  const advisory: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const isFatal = line.match(/ERROR\s+FATAL\s+(.+)$/);
    if (isFatal) fatal.push(isFatal[1].trim());
    const isAdvisory = line.match(/WARN\s+advisory\s+(.+)$/);
    if (isAdvisory) advisory.push(isAdvisory[1].trim());
  }
  return { fatal, advisory };
}

export async function publishSeason(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  if (!storyId) return;

  const editor = await getEditor();
  const args = ["-m", "src.publish", "--story", storyId];
  if (editor) args.push("--by", editor.id);

  try {
    await run("python", args, { cwd: REPO, timeout: 60_000 });
  } catch {
    // A refusal is not an error page. The screen already shows the same checks
    // this would report, so re-rendering says why on its own.
  }
  revalidatePath(`/serials/${storyId}`);
  revalidatePath("/serials");
}

export async function unpublishSeason(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  if (!storyId) return;
  try {
    await run("python", ["-m", "src.publish", "--story", storyId, "--unpublish"], {
      cwd: REPO,
      timeout: 30_000,
    });
  } catch {
    // Pulling something back is never gated, so a failure here is a broken
    // install rather than a refusal. The state file is the truth either way.
  }
  revalidatePath(`/serials/${storyId}`);
  revalidatePath("/serials");
}
