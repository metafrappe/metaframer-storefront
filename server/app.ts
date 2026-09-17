import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export interface StorefrontConfig {
  adminUrl: string;
  catalogSecret: string;
  production: boolean;
}
export function createApp(
  config: StorefrontConfig,
  fetcher: typeof fetch = fetch,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: config.production
            ? ["'self'"]
            : ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "https:", "data:"],
          connectSrc: config.production ? ["'self'"] : ["'self'", "ws:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use("/api/", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Request-ID", randomUUID());
    next();
  });
  const problem = (
    res: Response,
    status: number,
    title: string,
    detail: string,
  ) =>
    res
      .status(status)
      .type("application/problem+json")
      .json({
        type: `urn:metaframer:error:${title.toLowerCase()}`,
        title,
        status,
        detail,
        requestId: res.getHeader("X-Request-ID"),
      });
  app.use(
    "/api/",
    rateLimit({
      windowMs: 60000,
      limit: 90,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        problem(
          res,
          429,
          "RATE_LIMITED",
          "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.",
        ),
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "metaframer-storefront",
      catalogConfigured: Boolean(config.catalogSecret),
    }),
  );
  const querySchema = z
    .object({
      q: z.string().max(100).optional(),
      group: z.string().max(140).optional(),
      page: z.coerce.number().int().min(1).max(10000).optional(),
      pageSize: z.coerce.number().int().min(1).max(50).optional(),
      sort: z.enum(["name", "-modified", "code"]).optional(),
      status: z.literal("active").optional(),
    })
    .strict();
  async function proxy(
    req: Request,
    res: Response,
    id?: string,
    variants = false,
  ) {
    if (!config.catalogSecret || !config.adminUrl)
      return problem(
        res,
        503,
        "CATALOG_NOT_CONFIGURED",
        "Ürün kataloğu bağlantısı henüz hazır değil.",
      );
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
      return problem(
        res,
        422,
        "INVALID_QUERY",
        "Arama veya sayfa bilgisi geçersiz.",
      );
    const url = new URL(
      `/api/v1/catalog/products${id ? `/${encodeURIComponent(id)}${variants ? "/variants" : ""}` : ""}`,
      config.adminUrl,
    );
    for (const [key, value] of Object.entries(parsed.data))
      url.searchParams.set(key, String(value));
    let upstream: globalThis.Response;
    try {
      upstream = await fetcher(url, {
        headers: {
          Authorization: `Bearer ${config.catalogSecret}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(25000),
        redirect: "manual",
        cache: "no-store",
      });
    } catch {
      return problem(
        res,
        502,
        "CATALOG_UNAVAILABLE",
        "Ürünler şu anda yüklenemiyor. Lütfen tekrar deneyin.",
      );
    }
    let payload: any;
    try {
      payload = await upstream.json();
    } catch {
      return problem(
        res,
        502,
        "INVALID_RESPONSE",
        "Ürün servisi geçersiz yanıt döndürdü.",
      );
    }
    if (!upstream.ok) {
      const status = [404, 422, 429, 503, 504].includes(upstream.status)
        ? upstream.status
        : 502;
      return problem(
        res,
        status,
        "CATALOG_ERROR",
        status === 404
          ? "Ürün bulunamadı veya artık yayında değil."
          : status === 503
            ? "Ürün kataloğu bağlantısı henüz hazır değil."
            : "Ürünler yüklenemedi. Lütfen tekrar deneyin.",
      );
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      !("data" in payload) ||
      payload.meta?.source !== "frappe"
    )
      return problem(
        res,
        502,
        "INVALID_RESPONSE",
        "Ürün servisi geçersiz yanıt döndürdü.",
      );
    const product = z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      description: z.string(),
      group: z.string(),
      uom: z.string(),
      image: z.string().nullable(),
      disabled: z.boolean(),
      isStockItem: z.boolean(),
      hasVariants: z.boolean(),
      variantOf: z.string().nullable(),
      attributes: z.array(z.object({ name: z.string(), value: z.string() })),
      modified: z.string(),
    });
    const source = z.literal("frappe");
    const schema =
      id && !variants
        ? z.object({
            data: z.object({ product, variants: z.array(product) }),
            meta: z.object({
              source,
              variants: z
                .object({
                  page: z.number(),
                  pageSize: z.number(),
                  hasMore: z.boolean(),
                })
                .optional(),
            }),
          })
        : z.object({
            data: z.array(product),
            meta: z.object({
              page: z.number().int().positive(),
              pageSize: z.number().int().positive().max(50),
              hasMore: z.boolean(),
              source,
            }),
          });
    const validated = schema.safeParse(payload);
    if (!validated.success)
      return problem(
        res,
        502,
        "INVALID_RESPONSE",
        "Ürün servisi geçersiz yanıt döndürdü.",
      );
    res.json(validated.data);
  }
  app.get("/api/v1/products", (req, res) => proxy(req, res));
  app.get("/api/v1/products/:id/variants", (req, res) => {
    if (typeof req.params.id !== "string" || req.params.id.length > 140)
      return problem(res, 422, "INVALID_ID", "Ürün kodu geçersiz.");
    return proxy(req, res, req.params.id, true);
  });
  app.get("/api/v1/products/:id", (req, res) => {
    if (typeof req.params.id !== "string" || req.params.id.length > 140)
      return problem(res, 422, "INVALID_ID", "Ürün kodu geçersiz.");
    return proxy(req, res, req.params.id);
  });
  app.use("/api/", (_req, res) =>
    problem(res, 404, "NOT_FOUND", "API yolu bulunamadı."),
  );
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    problem(res, 500, "INTERNAL_ERROR", "İşlem tamamlanamadı."),
  );
  return app;
}
