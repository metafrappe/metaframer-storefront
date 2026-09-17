# Uzak test yayını

Vitrin React arayüzü ve salt okunur Express proxy birlikte yayımlanır. Tarayıcı aynı origin'deki `/api/v1/products` uçlarına bağlanır; proxy admin sunucusunun `/api/v1/catalog/products` uçlarına yalnız sunucuda saklanan `CATALOG_SHARED_SECRET` ile erişir.

İki reponun ortak Docker Compose ve nginx yayın paketi [metaframer-admin/deploy](https://github.com/metafrappe/metaframer-admin/tree/main/deploy) içinde; [yayın ve geri alma adımları](https://github.com/metafrappe/metaframer-admin/blob/main/docs/DEPLOYMENT.md) admin reposunda tutulur.

Hedef vitrin adresi `https://catalog-test.metaframer.net`, yönetim adresi `https://admin-test.metaframer.net`. **Bu adresler henüz yayınlanmış olarak doğrulanmadı.** Katalog okuyucusu kurulmadan gerçek ürün listesi testi tamamlanamaz.

`TRUSTED_PROXY_IPS` varsayılanı boştur. Ortak Linux/nginx dağıtımında `127.0.0.1,::1` verilir; nginx istemci forwarding başlıklarını kendi doğruladığı bilgilerle değiştirir. Container yalnız loopback dinler. Build sırasında `VITE_ADMIN_URL` gerçek HTTPS admin adresi olmalıdır.
