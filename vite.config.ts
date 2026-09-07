import { defineConfig } from "vite";

// Relative base so the build works at any hosting subpath (GitHub Pages
// project sites live under /<repo>/) and on a local preview server alike.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
});
