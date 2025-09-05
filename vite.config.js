import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Giữ tên file sạch sẽ cho content script
        entryFileNames: (chunk) => {
          if (chunk.name === "content") return "content.js";
          return "[name].js";
        },
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
