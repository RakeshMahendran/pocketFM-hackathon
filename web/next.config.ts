import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Databricks Apps runs one process per app, and that process is FastAPI.
  // Exporting to static HTML lets the API serve the UI from the same origin
  // instead of running a second Next server nobody can route to.
  output: "export",
};

export default nextConfig;
