import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    "/api/meta-analysis/full-text/analyze": [
      "./node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs",
      "./node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs",
      "./node_modules/pdf-parse/dist/worker/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/api/grants/rfp-analysis": [
      "./node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs",
      "./node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs",
      "./node_modules/pdf-parse/dist/worker/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
