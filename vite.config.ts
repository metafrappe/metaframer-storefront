import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const base = env.VITE_BASE_PATH || "/";
  if (!base.startsWith("/") || !base.endsWith("/") || base.startsWith("//"))
    throw new Error("VITE_BASE_PATH must be an absolute path ending in /.");
  if (env.VITE_API_BASE_URL) {
    const api = new URL(env.VITE_API_BASE_URL);
    if (api.protocol !== "https:" || api.username || api.password ||
        api.pathname !== "/" || api.search || api.hash)
      throw new Error("VITE_API_BASE_URL must be a public HTTPS origin without credentials or a path.");
  }
  if (env.VITE_ROUTER_MODE && !["browser", "hash"].includes(env.VITE_ROUTER_MODE))
    throw new Error("VITE_ROUTER_MODE must be browser or hash.");
  return {
    base,
    plugins: [react()],
    build: { outDir: "dist/client" },
    server: { host: "127.0.0.1" },
  };
});
