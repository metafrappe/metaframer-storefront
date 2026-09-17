import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 4301);
const app = createApp({
  trustedProxyIps: process.env.TRUSTED_PROXY_IPS,
  adminUrl: process.env.ADMIN_API_URL || "http://localhost:4300",
  catalogSecret: process.env.CATALOG_SHARED_SECRET || "",
  production,
});
if (production) {
  app.use(express.static(path.join(root, "dist/client")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/client/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { port: 24301 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.info(`Metaframer storefront: http://localhost:${port}`),
);
