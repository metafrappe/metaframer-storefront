import { expect, test, type Page } from "@playwright/test";
import type { Product, ProductDetail, ProductList } from "../shared/contracts";

const basePath = process.env.VITE_BASE_PATH || "/";
const hashRouting = process.env.VITE_ROUTER_MODE === "hash";
const remoteApiOrigin = process.env.VITE_API_BASE_URL?.replace(/\/$/, "");
const apiPath = remoteApiOrigin ? "/api/v1/public/products" : "/api/v1/products";
const apiPattern = `**${apiPath}**`;
const responseHeaders = { "Access-Control-Allow-Origin": "*" };
const uiPath = (path = "/") => hashRouting
  ? `${basePath}#${path}`
  : `${basePath}${path.slice(1)}`;


/**
 * These are isolated UI/API-contract tests. Every product response is explicitly
 * intercepted here; these tests do NOT claim to verify the live Frappe service.
 * The production application never imports these fixtures or falls back to them.
 */
const products: Product[] = Array.from({ length: 13 }, (_, index) => ({
  id: `UI-TEST-${String(index + 1).padStart(2, "0")}`,
  code: `UI-TEST-${String(index + 1).padStart(2, "0")}`,
  name: `Katalog test ürünü ${String(index + 1).padStart(2, "0")}`,
  description:
    "Yalnızca kontrollü arayüz testi verisi; canlı ERPNext ürünü değildir.",
  group: "Arayüz test grubu",
  uom: "Adet",
  image: null,
  disabled: false,
  isStockItem: true,
  hasVariants: index === 0,
  variantOf: null,
  attributes: [],
  modified: `2026-09-17 10:${String(index).padStart(2, "0")}:00`,
}));
const variant: Product = {
  ...products[0],
  id: "UI-VARIANT-GREEN",
  code: "UI-VARIANT-GREEN",
  name: "Katalog test ürünü — yeşil varyant",
  hasVariants: false,
  variantOf: products[0].id,
  attributes: [{ name: "Renk", value: "Orman yeşili" }],
};

async function mockCatalog(page: Page) {
  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === apiPath) {
      const query = (url.searchParams.get("q") || "").toLocaleLowerCase("tr");
      const group = url.searchParams.get("group") || "";
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 12);
      const filtered = products.filter(
        (product) =>
          (!query ||
            `${product.name} ${product.code}`
              .toLocaleLowerCase("tr")
              .includes(query)) &&
          (!group || product.group === group),
      );
      if (url.searchParams.get("sort") === "-modified") filtered.reverse();
      const start = (pageNumber - 1) * pageSize;
      const response: ProductList = {
        data: filtered.slice(start, start + pageSize),
        meta: {
          page: pageNumber,
          pageSize,
          hasMore: start + pageSize < filtered.length,
          source: "frappe",
        },
      };
      await route.fulfill({ headers: responseHeaders, json: response });
      return;
    }
    const id = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    const product = [...products, variant].find((item) => item.id === id);
    if (!product) {
      await route.fulfill({ headers: responseHeaders,
        status: 404,
        json: { status: 404, title: "NOT_FOUND", requestId: "ui-contract-404" },
      });
      return;
    }
    const response: ProductDetail = {
      data: {
        product,
        variants: product.id === products[0].id ? [variant] : [],
      },
      meta: { source: "frappe" },
    };
    await route.fulfill({ headers: responseHeaders, json: response });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [390, 768, 1280, 1536]) {
  test(`catalog and product details work at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockCatalog(page);
    await page.goto(uiPath());
    await expect(page.locator(".product-card")).toHaveCount(12);
    await expect(
      page.getByRole("heading", { name: products[0].name }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`catalog-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page
      .getByRole("link", { name: new RegExp(products[0].name) })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: products[0].name }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ürün varyantları." }),
    ).toBeVisible();
    await expect(page.locator(".variant-row")).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`product-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.getByRole("link", { name: new RegExp(variant.name) }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: variant.name }),
    ).toBeVisible();
    await expect(page.getByText("Orman yeşili", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Ana ürünü ve diğer varyantları gör" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: products[0].name }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("search, filtering, sorting, pagination and back links preserve the URL state", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto(uiPath());
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.getByLabel("Ürün adı veya kodu ara").fill("Katalog");
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(page).toHaveURL(/q=Katalog/);
  await page.getByRole("button", { name: "Filtrele", exact: true }).click();
  await page
    .getByLabel("Ürün grubu", { exact: true })
    .fill("Arayüz test grubu");
  await page.getByRole("button", { name: "Filtreyi uygula" }).click();
  await expect(page).toHaveURL(/group=Aray%C3%BCz\+test\+grubu/);
  await page.getByLabel("Ürünleri sırala").selectOption("-modified");
  await expect(page).toHaveURL(/sort=-modified/);
  await expect(page.locator(".product-card").first()).toContainText(
    products[12].name,
  );
  await page.getByRole("button", { name: "Sonraki" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sonraki" })).toBeDisabled();
  await page.locator(".product-card").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: products[0].name }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Kataloğa dön" }).click();
  await expect(page).toHaveURL(/q=Katalog/);
  await expect(page).toHaveURL(/group=Aray%C3%BCz\+test\+grubu/);
  await expect(page).toHaveURL(/sort=-modified/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByLabel("Ürün adı veya kodu ara")).toHaveValue(
    "Katalog",
  );
  await expect(page.getByLabel("Ürün grubu", { exact: true })).toHaveValue(
    "Arayüz test grubu",
  );
  await page.getByRole("button", { name: "Önceki" }).click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Önceki" })).toBeDisabled();
});

test("an empty search can be cleared without adding invented products", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto(uiPath("/?q=does-not-exist"));
  await expect(
    page.getByRole("heading", { name: "Biraz daha farklı arayalım." }),
  ).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Tüm ürünlere dön" }).click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  await expect(page.getByLabel("Ürün adı veya kodu ara")).toHaveValue("");
});

for (const status of [429, 503]) {
  test(`${status} is reported honestly; retry can return an empty catalog`, async ({
    page,
  }) => {
    let recover = false;
    await page.route(apiPattern, (route) =>
      recover
        ? route.fulfill({ headers: responseHeaders,
            json: {
              data: [],
              meta: { page: 1, pageSize: 12, hasMore: false, source: "frappe" },
            } satisfies ProductList,
          })
        : route.fulfill({ headers: responseHeaders,
            status,
            contentType: "application/problem+json",
            body: JSON.stringify({
              status,
              title: "UPSTREAM_FAILURE",
              detail: "Raw upstream details must not be displayed",
              requestId: `ui-contract-${status}`,
            }),
          }),
    );
    await page.goto(uiPath());
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      status === 429
        ? "Kısa sürede çok fazla istek gönderildi."
        : "Katalog şu anda kullanıma hazır değil.",
    );
    await expect(
      page.getByText(`Destek kodu: ui-contract-${status}`),
    ).toBeVisible();
    await expect(
      page.getByText("Raw upstream details must not be displayed"),
    ).toHaveCount(0);
    await expect(page.locator(".product-card")).toHaveCount(0);
    recover = true;
    await page.getByRole("button", { name: "Yeniden dene" }).click();
    await expect(
      page.getByRole("heading", { name: "Katalog hazırlanıyor." }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".product-card")).toHaveCount(0);
  });
}

test("a missing product has a recoverable 404 instead of fake details", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto(uiPath("/products/DOES-NOT-EXIST"));
  await expect(page.getByRole("alert")).toContainText(
    "Bu ürün bulunamadı veya artık katalogda yayımlanmıyor.",
  );
  await expect(page.locator(".product-detail")).toHaveCount(0);
  await page.getByRole("link", { name: "Kataloğa dön" }).click();
  await expect(page.locator(".product-card")).toHaveCount(12);
});

test("variant pagination retries the failed page, keeps existing rows and deduplicates appended results", async ({
  page,
}) => {
  const variants: Product[] = Array.from({ length: 70 }, (_, index) => ({
    ...variant,
    id: `UI-PAGED-VARIANT-${index + 1}`,
    code: `UI-PAGED-VARIANT-${index + 1}`,
    name: `Sayfalı varyant ${index + 1}`,
    // List responses need not hydrate attributes; individual details do.
    attributes: [],
  }));
  const requests: { page: string | null; pageSize: string | null }[] = [];
  let releaseResponse: () => void = () => {};
  const nextResponseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/variants")) {
      requests.push({
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
      });
      if (requests.length === 1) {
        await route.fulfill({ headers: responseHeaders,
          status: 503,
          json: {
            status: 503,
            title: "UNAVAILABLE",
            requestId: "variants-retry",
          },
        });
        return;
      }
      await nextResponseGate;
      await route.fulfill({ headers: responseHeaders,
        json: {
          // The first row overlaps due to a catalog change between page requests.
          data: [variants[0], ...variants.slice(50)],
          meta: { page: 2, pageSize: 50, hasMore: false, source: "frappe" },
        } satisfies ProductList,
      });
      return;
    }
    await route.fulfill({ headers: responseHeaders,
      json: {
        data: { product: products[0], variants: variants.slice(0, 50) },
        meta: {
          source: "frappe",
          variants: { page: 1, pageSize: 50, hasMore: true },
        },
      } satisfies ProductDetail,
    });
  });
  await page.goto(uiPath(`/products/${products[0].id}`));
  await expect(page.locator(".variant-row")).toHaveCount(50);
  await expect(page.getByText("50 seçenek gösteriliyor")).toBeVisible();
  await page.getByRole("button", { name: "Daha fazla varyant" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Katalog şu anda kullanıma hazır değil.",
  );
  await expect(page.locator(".variant-row")).toHaveCount(50);
  await expect(
    page.getByRole("heading", { level: 1, name: products[0].name }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Varyantları yeniden yükle" }).click();
  await expect(
    page.getByRole("button", { name: "Varyantlar yükleniyor…" }),
  ).toBeDisabled();
  releaseResponse();
  await expect(page.locator(".variant-row")).toHaveCount(70);
  await expect(page.getByText("70 seçenek gösteriliyor")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Daha fazla varyant" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".variant-row").filter({ hasText: "UI-PAGED-VARIANT-70" }),
  ).toBeVisible();
  expect(requests).toEqual([
    { page: "2", pageSize: "50" },
    { page: "2", pageSize: "50" },
  ]);
});


test("section links scroll without replacing the route hash, and skip link moves focus", async ({ page }) => {
  await mockCatalog(page);
  await page.goto(uiPath());
  await expect(page.locator(".product-card")).toHaveCount(12);
  const current = page.url();
  await page.getByRole("link", { name: "Kataloğa göz atın" }).click();
  await expect(page).toHaveURL(current);
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.getByRole("link", { name: "Kataloğun başına dön" }).click();
  await expect(page).toHaveURL(current);
  const skip = page.getByRole("link", { name: "İçeriğe geç" });
  await skip.focus();
  await skip.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page).toHaveURL(current);
});

test("project-base assets, direct detail refresh and remote catalog requests work without browser credentials", async ({ page }) => {
  const fontResponses: { url: string; status: number }[] = [];
  const apiRequests: { url: string; cookie: string | undefined; authorization: string | undefined }[] = [];
  page.on("response", response => {
    if (/\.woff2(?:\?|$)/.test(response.url()))
      fontResponses.push({ url: response.url(), status: response.status() });
  });
  page.on("request", request => {
    if (request.url().includes(apiPath)) apiRequests.push({
      url: request.url(), cookie: request.headers().cookie, authorization: request.headers().authorization,
    });
  });
  if (remoteApiOrigin) {
    // This cookie is a synthetic fixture. Public catalog requests must omit it.
    await page.context().addCookies([{ name: "unrelated_session", value: "test-only-do-not-send", url: remoteApiOrigin }]);
    await page.route(`${remoteApiOrigin}/**`, route => route.abort());
  }
  await mockCatalog(page);
  await page.goto(uiPath(`/products/${products[0].id}`));
  await expect(page.getByRole("heading", { level: 1, name: products[0].name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: products[0].name })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(fontResponses.length).toBeGreaterThan(0);
  expect(fontResponses.every(font => font.status === 200 && new URL(font.url).pathname.startsWith(basePath))).toBe(true);
  expect(apiRequests.length).toBeGreaterThan(0);
  for (const request of apiRequests) {
    const url = new URL(request.url);
    expect(url.pathname).toBe(`${apiPath}/${products[0].id}`);
    if (remoteApiOrigin) expect(url.origin).toBe(remoteApiOrigin);
    expect(request.cookie).toBeUndefined();
    expect(request.authorization).toBeUndefined();
  }
  await expect(page.getByRole("link", { name: "Yönetim", exact: true })).toHaveAttribute(
    "href", process.env.VITE_ADMIN_URL || "http://localhost:4300",
  );
});
