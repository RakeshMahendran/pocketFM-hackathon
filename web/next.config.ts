import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Databricks Apps runs one process per app, and that process is FastAPI.
  // Exporting to static HTML lets the API serve the UI from the same origin
  // instead of running a second Next server nobody can route to.
  output: "export",

  // Emit candidates/<id>/index.html rather than candidates/<id>.html.
  // Without this the export also writes a candidates/<id>/ directory holding
  // only RSC payloads; StaticFiles resolves the URL to that directory, finds
  // no index.html, and serves 404. In-app clicks survive on prefetch, so the
  // breakage only shows on refresh and deep links.
  trailingSlash: true,
};

export default nextConfig;
