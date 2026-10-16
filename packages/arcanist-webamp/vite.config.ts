import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { thirdPartyNotices } from "./notices";

// The Arcanist server the dev server talks to (the APIs are same-origin in production).
const arcanist = process.env.ARCANIST_URL ?? "http://localhost:8484";

export default defineConfig({
  // Arcanist serves players at / and at /players/<id>/: every asset is relative.
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 2500,
  },
  plugins: [
    tailwindcss(),
    // music-metadata (tags of local files dropped on the playlist) uses polyfillable Node APIs.
    // @ts-expect-error Rollup plugin type mismatch with Vite's stricter types
    nodePolyfills(),
    // THIRD-PARTY-NOTICES.txt, next to LICENSE.txt (public/).
    thirdPartyNotices(),
  ],
  server: {
    proxy: {
      "/rest": { target: arcanist, changeOrigin: true },
      "/graphql": { target: arcanist, changeOrigin: true, ws: true },
    },
  },
});
