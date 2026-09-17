import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Product, ProductDetail, ProductList } from "../shared/contracts";
import { ApiError, getResource } from "./api";

const adminUrl = import.meta.env.VITE_ADMIN_URL || "http://localhost:4300";
const PAGE_SIZE = 12;

function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  // Changing #catalog would navigate HashRouter to an unrelated route.
  event.preventDefault();
  const section = document.getElementById(id);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (section?.hasAttribute("tabindex")) section.focus({ preventScroll: true });
}

function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label="Metaframer ana sayfa">
          <span className="brand-symbol">
            <Layers3 size={23} strokeWidth={1.7} />
          </span>
          metaframer<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Ana menü">
          <Link to="/" className="nav-active">
            Katalog
          </Link>
          <a href={adminUrl} className="admin-link">
            Yönetim <ArrowUpRight size={16} />
          </a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="footer-brand">
        metaframer.
      </Link>
      <p>Ürünler, detaylar ve olasılıklar.</p>
      <a href={adminUrl}>
        Yönetim paneli <ArrowUpRight size={15} />
      </a>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function ProductImage({
  product,
  prominent = false,
}: {
  product: Product;
  prominent?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.image]);
  // Never interpret a product-supplied URL as markup or a script URL.
  const image =
    product.image && /^(https?:\/\/|\/[^/])/i.test(product.image)
      ? product.image
      : null;
  return (
    <div className={`product-image${prominent ? " prominent" : ""}`}>
      {image && !failed ? (
        <img
          src={image}
          alt={product.name}
          loading={prominent ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="image-placeholder">
          <div className="placeholder-orbit">
            <Box strokeWidth={0.9} size={prominent ? 98 : 64} />
          </div>
          <span>Ürün görseli eklenmedi</span>
        </div>
      )}
      {product.hasVariants && (
        <span className="image-tag">
          <Layers3 size={13} /> Varyantlı ürün
        </span>
      )}
    </div>
  );
}

function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <section className="feedback-state error-state" role="alert">
      <div className="state-icon">
        <Package size={26} strokeWidth={1.5} />
      </div>
      <h2>Kısa bir ara.</h2>
      <p>
        {error.message ||
          "Bağlantı kurulamadı. İnternet bağlantınızı kontrol ederek yeniden deneyin."}
      </p>
      <button className="button button-primary" onClick={retry}>
        <RefreshCw size={16} /> Yeniden dene
      </button>
      {error instanceof ApiError && error.requestId && (
        <small>Destek kodu: {error.requestId}</small>
      )}
    </section>
  );
}

function LoadingCards() {
  return (
    <div
      className="product-grid"
      aria-busy="true"
      aria-label="Ürünler yükleniyor"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton skeleton-image" />
          <div className="skeleton skeleton-caption" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-caption short" />
        </div>
      ))}
    </div>
  );
}

function ProductCard({
  product,
  returnSearch,
}: {
  product: Product;
  returnSearch: string;
}) {
  return (
    <Link
      to={`/products/${encodeURIComponent(product.id)}`}
      state={{ returnSearch }}
      className="product-card"
    >
      <ProductImage product={product} />
      <div className="card-content">
        <div className="card-eyebrow">
          <span>{product.group}</span>
          <ArrowUpRight size={19} className="card-arrow" />
        </div>
        <h3>{product.name}</h3>
        <div className="card-meta">
          <span>{product.code}</span>
          <span>{product.uom}</span>
        </div>
      </div>
    </Link>
  );
}

function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const group = params.get("group") || "";
  const sort = ["name", "-modified", "code"].includes(params.get("sort") || "")
    ? params.get("sort")!
    : "name";
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const [searchText, setSearchText] = useState(q);
  const [groupText, setGroupText] = useState(group);
  const [filtersOpen, setFiltersOpen] = useState(!!group);
  const [result, setResult] = useState<ProductList | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const catalogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setSearchText(q);
    setGroupText(group);
  }, [q, group]);
  useEffect(() => {
    document.title = "Ürün kataloğu · Metaframer";
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      q,
      group,
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
    });
    getResource<ProductList>(`/api/v1/products?${query}`, controller.signal)
      .then(setResult)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason
              : new Error("Bağlantı kurulamadı."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, group, page, sort, revision]);
  function updateParams(values: Record<string, string>) {
    // Hash navigation can update the address before React finishes rendering.
    // Merge rapid filter changes into the latest URL so earlier filters survive.
    const currentUrl = import.meta.env.VITE_ROUTER_MODE === "hash"
      ? new URL(window.location.hash.slice(1), window.location.origin)
      : new URL(window.location.href);
    const next = new URLSearchParams(currentUrl.search);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    updateParams({ q: searchText.trim(), page: "" });
  }
  function submitGroup(event: FormEvent) {
    event.preventDefault();
    updateParams({ group: groupText.trim(), page: "" });
  }
  function goPage(next: number) {
    updateParams({ page: next === 1 ? "" : String(next) });
    catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="small-dot" /> METAFRAMER KATALOG
          </div>
          <h1>
            Ürünleri keşfedin.
            <br />
            <span>Detayları görün.</span>
          </h1>
          <p>
            İhtiyacınız olan ürünü bulun, özelliklerini inceleyin
            <br className="desktop-break" /> ve size uygun varyantı keşfedin.
          </p>
          <a className="hero-cta" href="#catalog" onClick={(event) => scrollToSection(event, "catalog")}>
            Kataloğa göz atın{" "}
            <span>
              <ArrowDown size={18} />
            </span>
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-card art-card-back">
            <div />
            <span />
          </div>
          <div className="art-card art-card-front">
            <div className="art-mini-logo">
              <Layers3 size={26} strokeWidth={1.2} />
            </div>
            <div className="art-object">
              <Box size={84} strokeWidth={0.65} />
            </div>
            <div className="art-lines">
              <i />
              <i />
            </div>
            <div className="art-card-bottom">
              <span>DAHA YAKINDAN</span>
              <ArrowUpRight size={20} />
            </div>
          </div>
          <span className="art-note">
            Bir arada.
            <br />
            Tüm detaylarıyla.
          </span>
          <span className="art-dot" />
        </div>
      </section>
      <main>
        <section
          className="catalog-section"
          id="catalog"
          ref={catalogRef}
          aria-labelledby="catalog-heading"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow muted">KOLEKSİYONU İNCELEYİN</span>
              <h2 id="catalog-heading">
                Ürün kataloğu<span>.</span>
              </h2>
            </div>
            <p>Aradığınızı kolayca bulun.</p>
          </div>
          <div className="catalog-toolbar">
            <form className="search-form" onSubmit={submitSearch}>
              <Search size={19} aria-hidden="true" />
              <label className="sr-only" htmlFor="product-search">
                Ürün adı veya kodu ara
              </label>
              <input
                id="product-search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Ürün adı veya kodu ara..."
                maxLength={100}
                type="search"
              />
              <button type="submit" className="search-submit" aria-label="Ara">
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="toolbar-actions">
              <button
                className={`filter-button${group ? " selected" : ""}`}
                onClick={() => setFiltersOpen((value) => !value)}
                aria-expanded={filtersOpen}
                aria-controls="catalog-filters"
              >
                <SlidersHorizontal size={17} /> Filtrele
                {group && <span className="filter-count">1</span>}
              </button>
              <div className="sort-control">
                <label className="sr-only" htmlFor="product-sort">
                  Ürünleri sırala
                </label>
                <select
                  id="product-sort"
                  value={sort}
                  onChange={(event) =>
                    updateParams({ sort: event.target.value, page: "" })
                  }
                >
                  <option value="name">İsme göre: A–Z</option>
                  <option value="-modified">Son güncellenen</option>
                  <option value="code">Ürün koduna göre</option>
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
            </div>
          </div>
          {filtersOpen && (
            <form
              className="filters-panel"
              id="catalog-filters"
              onSubmit={submitGroup}
            >
              <div>
                <label htmlFor="product-group">Ürün grubu</label>
                <input
                  id="product-group"
                  value={groupText}
                  onChange={(event) => setGroupText(event.target.value)}
                  maxLength={100}
                  placeholder="Grup adını yazın"
                />
              </div>
              <button className="button button-primary" type="submit">
                Filtreyi uygula <Check size={15} />
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setGroupText("");
                  updateParams({ group: "", page: "" });
                }}
              >
                Temizle
              </button>
            </form>
          )}
          {(q || group) && (
            <div className="active-filters" aria-label="Etkin filtreler">
              {q && (
                <button onClick={() => updateParams({ q: "", page: "" })}>
                  Arama: {q}
                  <X size={14} aria-label="Aramayı temizle" />
                </button>
              )}
              {group && (
                <button onClick={() => updateParams({ group: "", page: "" })}>
                  Grup: {group}
                  <X size={14} aria-label="Grup filtresini temizle" />
                </button>
              )}
            </div>
          )}
          <div className="results-topline" aria-live="polite">
            <span>
              {loading
                ? "Ürünler yükleniyor…"
                : error
                  ? "Katalog bağlantısı kurulamadı"
                  : `${result?.data.length || 0} ürün gösteriliyor`}
            </span>
            <span>Sayfa {page.toString().padStart(2, "0")}</span>
          </div>
          {loading ? (
            <LoadingCards />
          ) : error ? (
            <ErrorState
              error={error}
              retry={() => setRevision((value) => value + 1)}
            />
          ) : result?.data.length ? (
            <>
              <div className="product-grid">
                {result.data.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    returnSearch={params.toString()}
                  />
                ))}
              </div>
              <nav className="pagination" aria-label="Katalog sayfaları">
                <button
                  className="button button-outline"
                  disabled={page <= 1}
                  onClick={() => goPage(page - 1)}
                >
                  <ChevronLeft size={17} /> Önceki
                </button>
                <span>
                  Sayfa <strong>{page}</strong>
                </span>
                <button
                  className="button button-outline"
                  disabled={!result.meta.hasMore}
                  onClick={() => goPage(page + 1)}
                >
                  Sonraki <ChevronRight size={17} />
                </button>
              </nav>
            </>
          ) : (
            <div className="feedback-state">
              <div className="state-icon">
                <Search size={27} strokeWidth={1.5} />
              </div>
              <h2>
                {q || group
                  ? "Biraz daha farklı arayalım."
                  : page > 1
                    ? "Bu sayfada ürün kalmadı."
                    : "Katalog hazırlanıyor."}
              </h2>
              <p>
                {q || group
                  ? "Bu arama veya filtreyle eşleşen bir ürün bulunamadı. Başka bir kelime deneyin ya da filtreleri temizleyin."
                  : page > 1
                    ? "Yeni ürünleri görmek için ilk sayfaya dönebilirsiniz."
                    : "Yayımlanan ürünler burada yer alacak. Biraz sonra yeniden göz atabilirsiniz."}
              </p>
              {q || group || page > 1 ? (
                <button
                  className="button button-primary"
                  onClick={() => {
                    setParams({});
                    setFiltersOpen(false);
                  }}
                >
                  Tüm ürünlere dön <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="button button-outline"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  <RefreshCw size={16} /> Yenile
                </button>
              )}
            </div>
          )}
        </section>
        <section className="catalog-bottom">
          <div className="bottom-icon">
            <Layers3 size={25} strokeWidth={1.3} />
          </div>
          <div>
            <h2>Küçük farklar, doğru seçimler.</h2>
            <p>
              Ürün sayfalarında özellikleri ve mevcut varyantları birlikte
              inceleyin.
            </p>
          </div>
          <a href="#catalog" aria-label="Kataloğun başına dön" onClick={(event) => scrollToSection(event, "catalog")}>
            <ArrowUpRight size={25} />
          </a>
        </section>
      </main>
    </>
  );
}

function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const returnSearch =
    typeof location.state?.returnSearch === "string"
      ? location.state.returnSearch
      : "";
  const [result, setResult] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState<Error | null>(null);
  const variantRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    variantRequest.current?.abort();
    variantRequest.current = null;
    setVariantsLoading(false);
    setVariantsError(null);
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    getResource<ProductDetail>(
      `/api/v1/products/${encodeURIComponent(id || "")}`,
      controller.signal,
    )
      .then((data) => {
        setResult(data);
        document.title = `${data.data.product.name} · Metaframer`;
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason : new Error("Ürün yüklenemedi."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      variantRequest.current?.abort();
    };
  }, [id, revision]);

  async function loadMoreVariants() {
    const pagination = result?.meta.variants;
    if (!result || !pagination?.hasMore || variantRequest.current) return;
    const productId = result.data.product.id;
    const controller = new AbortController();
    variantRequest.current = controller;
    setVariantsLoading(true);
    setVariantsError(null);
    try {
      const query = new URLSearchParams({
        page: String(pagination.page + 1),
        pageSize: String(pagination.pageSize),
      });
      const next = await getResource<ProductList>(
        `/api/v1/products/${encodeURIComponent(productId)}/variants?${query}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult((previous) => {
        if (!previous || previous.data.product.id !== productId)
          return previous;
        // Catalog changes between requests can repeat a row across pages.
        const unique = new Map(
          previous.data.variants.map((item) => [item.id, item]),
        );
        next.data.forEach((item) => unique.set(item.id, item));
        return {
          ...previous,
          data: { ...previous.data, variants: [...unique.values()] },
          meta: {
            ...previous.meta,
            variants: {
              page: next.meta.page,
              pageSize: next.meta.pageSize,
              hasMore: next.meta.hasMore,
            },
          },
        };
      });
    } catch (reason) {
      if (!controller.signal.aborted)
        setVariantsError(
          reason instanceof Error
            ? reason
            : new Error("Varyantlar yüklenemedi. Lütfen yeniden deneyin."),
        );
    } finally {
      if (variantRequest.current === controller) {
        variantRequest.current = null;
        if (!controller.signal.aborted) setVariantsLoading(false);
      }
    }
  }
  const product = result?.data.product;
  return (
    <main className="detail-main">
      <nav className="breadcrumbs" aria-label="İçerik yolu">
        <Link to={returnSearch ? `/?${returnSearch}` : "/"}>
          <ArrowLeft size={15} /> Kataloğa dön
        </Link>
        <span>/</span>
        <span>{product?.name || "Ürün detayı"}</span>
      </nav>
      {loading ? (
        <div
          className="detail-loading"
          aria-busy="true"
          aria-label="Ürün bilgileri yükleniyor"
        >
          <div className="skeleton skeleton-detail-image" />
          <div>
            <div className="skeleton skeleton-caption" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-paragraph" />
          </div>
        </div>
      ) : error ? (
        <ErrorState
          error={error}
          retry={() => setRevision((value) => value + 1)}
        />
      ) : (
        product && (
          <>
            <article className="product-detail">
              <ProductImage product={product} prominent />
              <div className="detail-copy">
                <span className="eyebrow muted">{product.group}</span>
                <h1>{product.name}</h1>
                <p className="detail-code">
                  ÜRÜN KODU <span>{product.code}</span>
                </p>
                <div className="detail-description">
                  <h2>Ürün hakkında</h2>
                  <p>
                    {product.description ||
                      "Bu ürün için henüz bir açıklama eklenmemiş."}
                  </p>
                </div>
                <dl className="product-specs">
                  <div>
                    <dt>Ürün grubu</dt>
                    <dd>{product.group}</dd>
                  </div>
                  <div>
                    <dt>Ölçü birimi</dt>
                    <dd>{product.uom}</dd>
                  </div>
                  <div>
                    <dt>Ürün türü</dt>
                    <dd>
                      {product.hasVariants
                        ? "Varyant şablonu"
                        : product.variantOf
                          ? "Ürün varyantı"
                          : "Standart ürün"}
                    </dd>
                  </div>
                  {product.attributes.map((attribute, index) => (
                    <div key={`${attribute.name}-${index}`}>
                      <dt>{attribute.name}</dt>
                      <dd>{attribute.value || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {product.variantOf && (
                  <Link
                    className="parent-product"
                    to={`/products/${encodeURIComponent(product.variantOf)}`}
                    state={{ returnSearch }}
                  >
                    <Layers3 size={17} /> Ana ürünü ve diğer varyantları gör{" "}
                    <ArrowUpRight size={17} />
                  </Link>
                )}
                <div className="detail-note">
                  <Box size={18} strokeWidth={1.5} />
                  <p>
                    Ürünün mevcut özelliklerini ve seçeneklerini bu sayfadan
                    inceleyebilirsiniz.
                  </p>
                </div>
              </div>
            </article>
            {(product.hasVariants || result.data.variants.length > 0) && (
              <section
                className="variants-section"
                aria-labelledby="variants-heading"
              >
                <div className="section-heading">
                  <div>
                    <span className="eyebrow muted">SEÇENEKLERİ KEŞFEDİN</span>
                    <h2 id="variants-heading">
                      Ürün varyantları<span>.</span>
                    </h2>
                  </div>
                  <p aria-live="polite">
                    {result.data.variants.length} seçenek gösteriliyor
                  </p>
                </div>
                {result.data.variants.length ? (
                  <div className="variants-list">
                    {result.data.variants.map((variant, index) => (
                      <Link
                        className="variant-row"
                        key={variant.id}
                        to={`/products/${encodeURIComponent(variant.id)}`}
                        state={{ returnSearch }}
                      >
                        <span className="variant-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="variant-name">
                          <h3>{variant.name}</h3>
                          <span>{variant.code}</span>
                        </div>
                        <div className="variant-attributes">
                          {variant.attributes.map((attribute, i) => (
                            <span key={`${attribute.name}-${i}`}>
                              {attribute.name}: {attribute.value}
                            </span>
                          ))}
                        </div>
                        <ArrowUpRight size={21} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="variant-empty">
                    <Layers3 size={22} />
                    <p>
                      Bu ürün için henüz katalogda yayımlanmış bir varyant
                      bulunmuyor.
                    </p>
                  </div>
                )}
                {variantsError && (
                  <div className="variant-load-error" role="alert">
                    <p>{variantsError.message}</p>
                    {variantsError instanceof ApiError &&
                      variantsError.requestId && (
                        <small>Destek kodu: {variantsError.requestId}</small>
                      )}
                  </div>
                )}
                {result.meta.variants?.hasMore && (
                  <div
                    className="variants-pagination"
                    aria-busy={variantsLoading}
                  >
                    <button
                      className="button button-outline"
                      onClick={loadMoreVariants}
                      disabled={variantsLoading}
                    >
                      {variantsError ? (
                        <RefreshCw size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                      {variantsLoading
                        ? "Varyantlar yükleniyor…"
                        : variantsError
                          ? "Varyantları yeniden yükle"
                          : "Daha fazla varyant"}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )
      )}
    </main>
  );
}

function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow muted">404 · SAYFA BULUNAMADI</span>
      <h1>
        Aradığınız sayfa
        <br />
        burada değil.
      </h1>
      <p>Ürün kataloğuna dönerek keşfetmeye devam edin.</p>
      <Link to="/" className="button button-primary">
        Kataloğa dön <ArrowRight size={17} />
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => scrollToSection(event, "main-content")}>
        İçeriğe geç
      </a>
      <ScrollToTop />
      <Header />
      <div id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/products/:id" element={<ProductPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <Footer />
    </>
  );
}
