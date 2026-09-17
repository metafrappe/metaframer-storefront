# GitHub Pages yayını

Vitrin adresi: https://metafrappe.github.io/metaframer-storefront/
Yönetim adresi: https://metafrappe.github.io/metaframer-admin/

Arayüz GitHub Pages'ta statik yayımlanır. Tarayıcı gerçek ürünleri `https://headless-api.metaframer.net/api/v1/public/products` üzerinden okur. API yalnız `Metaframer Demo` grubundaki etkin satış ürünlerini salt okunur hesapla listeler. Tarayıcı katalog API anahtarı, cookie veya Authorization göndermez.

`.github/workflows/pages.yml`, main değişikliklerinde test → build → Pages deploy çalıştırır. Derleme ayarları:

```env
VITE_BASE_PATH=/metaframer-storefront/
VITE_ROUTER_MODE=hash
VITE_API_BASE_URL=https://headless-api.metaframer.net
VITE_ADMIN_URL=https://metafrappe.github.io/metaframer-admin/
```

HashRouter sayesinde doğrudan ürün bağlantıları ve sayfa yenileme Pages'ta çalışır. API kullanılamazsa arayüz gerçek hata gösterir; mock veriye sessizce geçmez.

Yerel geliştirmede değişkenler verilmezse mevcut Node proxy ve BrowserRouter davranışı korunur. Canlı test sonucu ayrıca doğrulanmalıdır; GitHub'da yeşil `Checks`, yayın veya gerçek CRUD kanıtı değildir.
