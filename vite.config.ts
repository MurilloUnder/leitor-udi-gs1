/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  server: { host: "127.0.0.1", port: 43127, strictPort: true },
  preview: { host: "127.0.0.1", port: 43127, strictPort: true },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png", "exemplos/*"],
      manifest: {
        name: "Leitor UDI",
        short_name: "Leitor UDI",
        description: "Lê UDI GS1, HIBCC e ISBT 128 no celular. Os dados ficam no aparelho.",
        lang: "pt-BR",
        dir: "ltr",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f4f0e6",
        theme_color: "#0d5c4c",
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,csv,xlsx,wasm,txt}"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 40000,
  },
});
