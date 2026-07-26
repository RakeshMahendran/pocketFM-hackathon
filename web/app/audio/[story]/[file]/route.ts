import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import type { NextRequest } from "next/server";

import { resolveAudioFile } from "@/lib/audio";

/**
 * Serves one finished mix out of `data/stories/<story>/audio/`.
 *
 * The audio is not under `web/public/`, so Next cannot hand it out as a static
 * file, and it should not be: it is generated output that a season overwrites,
 * and copying 8 MB into the bundle on every run is the wrong shape. This is the
 * one place those bytes are read.
 *
 * Not under `/api/`. `next.config.ts` rewrites `/api/:path*` to FastAPI on a
 * loopback port; an app route would currently win over that rewrite because
 * filesystem routes are matched first, but relying on that ordering to keep
 * audio out of the API proxy is a trap for whoever edits either file next.
 *
 * Two things this has to get right:
 *
 *  - **The path comes from a URL.** `resolveAudioFile` resolves it and refuses
 *    anything that is not a direct child of that story's audio directory. The
 *    check lives in `lib/audio.ts` so the reader and the server agree on what
 *    is reachable by construction rather than by both remembering to.
 *  - **Range requests.** A 4 MB episode with no range support cannot be
 *    scrubbed — the browser has to refetch from zero to seek, and Safari will
 *    not play a media source that does not advertise `Accept-Ranges` at all.
 */

// The response depends on the request's Range header and on bytes read off
// local disk, so there is nothing here to prerender.
export const dynamic = "force-dynamic";

interface Span {
  start: number;
  end: number;
}

/**
 * RFC 9110 single-range parsing, and no more than that.
 *
 * A multipart range (`bytes=0-99,200-299`) is answered with the whole file,
 * which is allowed: a server may always ignore a Range header. Media elements
 * never send one.
 */
function parseRange(header: string | null, size: number): Span | "unsatisfiable" | null {
  if (!header) return null;

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (!rawStart) {
    // `bytes=-500` is the LAST 500 bytes, not the first 500. Getting this
    // backwards serves the wrong audio rather than failing, so it is worth the
    // separate branch.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  }

  if (start > end || start >= size) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

/** A file slice as a web stream. Node's reader is inclusive of `end`, as HTTP is. */
function body(file: string, span: Span): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(file, { start: span.start, end: span.end }),
  ) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/audio/[story]/[file]">,
) {
  const { story, file } = await ctx.params;

  const full = resolveAudioFile(story, file);
  if (!full) {
    // Covers a traversal, a separator smuggled through an encoded segment, and
    // a request for a manifest or an episode file sitting in the same
    // directory. All of them are the caller asking for something that is not on
    // offer, so all of them get the same answer and none of them get a reason.
    return new Response("Not found", { status: 404 });
  }

  let size: number;
  let mtimeMs: number;
  try {
    const s = await stat(full);
    if (!s.isFile()) return new Response("Not found", { status: 404 });
    size = s.size;
    mtimeMs = s.mtimeMs;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // Generated output, rewritten whenever a season is re-voiced, so the validator
  // is derived from what is on disk rather than from a fixed version.
  const etag = `"${size.toString(16)}-${Math.round(mtimeMs).toString(16)}"`;
  const common = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": new Date(mtimeMs).toUTCString(),
    // Long enough that scrubbing does not refetch the same bytes all afternoon,
    // and private because this is a console behind a sign-in, not a CDN origin.
    "Cache-Control": "private, max-age=3600",
  };

  const range = parseRange(request.headers.get("range"), size);

  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "Content-Range": `bytes */${size}` },
    });
  }

  if (range) {
    const length = range.end - range.start + 1;
    return new Response(body(full, range), {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(length),
      },
    });
  }

  // A zero-byte file would make `end: -1` mean "to the end" and stream nothing
  // forever, so it is answered directly.
  if (size === 0) {
    return new Response(null, {
      status: 200,
      headers: { ...common, "Content-Length": "0" },
    });
  }

  return new Response(body(full, { start: 0, end: size - 1 }), {
    status: 200,
    headers: { ...common, "Content-Length": String(size) },
  });
}
