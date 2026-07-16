/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile runtime stage runs `node server.js` from .next/standalone
  output: "standalone",
  experimental: {
    // Required in Next 14 for instrumentation.ts (scheduler bootstrap)
    instrumentationHook: true,
    // pdf-parse depends on @napi-rs/canvas, a native module — keep it out of
    // the bundler so Node loads it at runtime. Bundling pdf-parse also picks
    // its browser build, which throws "DOMMatrix is not defined" on the server.
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
