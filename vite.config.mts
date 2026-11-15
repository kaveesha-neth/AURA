import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root: "src",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../renderer-dist",
    emptyOutDir: true,
    rolldownOptions: { input: [fileURLToPath(new URL('./src/index.html',import.meta.url)),fileURLToPath(new URL('./src/floating-lyrics.html',import.meta.url))] },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
