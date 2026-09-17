# GitHub Pages test adresi

https://metafrappe.github.io/metaframer-storefront/ · [Yayın mimarisi](docs/DEPLOYMENT.md)

# Metaframer Storefront

ERPNext ürünleri için responsive headless vitrin: ürün kataloğu, arama/filtre/sıralama, ürün detayı ve sayfalı varyant listesi.

## Bağlantı

```text
Tarayıcı → bu reponun GET /api/v1/products uçları
         → metaframer-admin /api/v1/catalog/products
         → ERPNext Item API
```

[metafrappe/metaframer-admin](https://github.com/metafrappe/metaframer-admin) ürün API adaptörünü ve yönetim panelini içerir. ERPNext tek veri kaynağıdır; bu repo veritabanı tutmaz. Yönetimde kaydedilen değişiklik vitrinin yeni API isteğinde görünür; kalıcı cache yoktur. Önceden açık sayfada değişiklik görmek için yeniden yükleyin; gerçek zamanlı push bu sürümün kapsamı dışındadır.

## Çalıştırma

Node.js 24:

```sh
npm ci
cp .env.example .env
# ADMIN_API_URL: yönetim sunucusunun adresi
# CATALOG_SHARED_SECRET: yönetim reposundakiyle aynı sunucular arası sır
npm run dev
```

<http://localhost:4301>

`ADMIN_API_URL` ve `CATALOG_SHARED_SECRET` yalnız sunucuda kullanılır. Tarayıcı bunları almaz. `VITE_ADMIN_URL` yalnız görünür yönetim bağlantısıdır; sır içermez.

Önce admin reposunun `/setup` adımlarıyla salt okunur Frappe katalog hesabını ve demo ürün grubunu hazırlayın. Bağlantı yoksa vitrin açık bir hata gösterir; sessiz mock fallback yoktur.

## Ürün davranışı

- Halka yalnız yapılandırılan gruptaki etkin satış ürünleri açılır.
- Görsel yoksa yer tutucu gösterilir. Ürün fiyatı/depodaki miktarı bu kapsamda alınmadığından uydurma değer gösterilmez.
- Demo kayıtlardaki manzara fotoğrafları temsilidir; demo açıklamalarında belirtilir.
- Varyantlar Item `variant_of` ilişkisiyle gelir; 50'li sayfalar halinde yüklenir.
- Hata, boş sonuç, 404, yükleniyor, yeniden deneme, geri dönünce filtreleri koruma desteklenir.
- Bu vitrin alışveriş sepeti veya ödeme işlemi içermez.

## Test ve sözleşme

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

HTTP proxy ve UI testlerinde kontrollü upstream/API yanıtları kullanılır. Bunlar gerçek Frappe CRUD testi değildir. Canlı kalıcılık testi admin reposunun `/setup` ekranından çalıştırılır; test ürünü bu vitrinden bağımsız GET ile de doğrulanır.

[API sözleşmesi](docs/openapi.json) admin reposundaki v1 sözleşmesinin kopyasıdır. [TypeScript türleri](shared/contracts.ts) aynı sürüme aittir. API değişimlerinde iki repo aynı sözleşme sürümüne güncellenmelidir.

## Production

```sh
npm run build
NODE_ENV=production HOST=0.0.0.0 npm start
```

Dockerfile dahildir. `.env` imaja alınmaz. Servisler arasındaki anahtar deployment ortamından sağlanmalıdır. `VITE_ADMIN_URL` derleme anında tanımlanır. Yazı tipleri yereldir; lisanslar `public/fonts/` içindedir.

Repo oluşturulması otomatik canlı sunucu dağıtımı anlamına gelmez. Geçerli Frappe katalog erişimi sağlanana kadar gerçek ürün bağlantısı tamamlanmış sayılmaz.
