# Railway'e yayınlama kılavuzu

Bilgisayarınıza hiçbir şey kurmanız, terminal açmanız veya komut çalıştırmanız
gerekmez. Her şey Railway'in web arayüzünden yapılır. Toplam süre ~10 dakika.

Uygulama ilk açılışta veritabanını, ürün gruplarını ve yönetici hesabını
**kendiliğinden** oluşturur.

---

## Adım 1 — Projeyi oluşturun

1. <https://railway.com/new> adresine gidin.
2. **Deploy from GitHub repo** seçeneğine tıklayın.
3. İlk kez bağlıyorsanız **Configure GitHub App** ile Railway'e
   `Kamercan/business_partner` deposuna erişim izni verin.
4. Listeden **`Kamercan/business_partner`** deposunu seçin.

Railway depoyu tarar ve kök dizindeki `Dockerfile` + `railway.json` dosyalarını
otomatik bulur. Build ayarı yapmanıza gerek yoktur.

## Adım 2 — Doğru dalı (branch) seçin

1. Oluşan servise tıklayın → **Settings** sekmesi.
2. **Source → Branch** bölümünde dalı
   **`claude/business-partner-application-3qj7js`** olarak seçin.

> Bu dalı `main` ile birleştirdiyseniz `main` de seçebilirsiniz.

## Adım 3 — Kalıcı disk ekleyin ⚠️ (en önemli adım)

Veritabanı ve tedarikçilerin yüklediği belgeler bu diskte durur.
**Bu adımı atlarsanız her yeni dağıtımda tüm veriler silinir.**

1. Servise sağ tıklayın (veya servis kartındaki **⋮** menüsü) →
   **Attach Volume** / **Add Volume**.
2. **Mount path** alanına tam olarak şunu yazın:

   ```
   /data
   ```

3. Kaydedin.

## Adım 4 — Ortam değişkenlerini girin

Servis → **Variables** sekmesi → **Raw Editor** ile aşağıdakileri toplu
yapıştırabilirsiniz.

### Demo / tanıtım kurulumu (şirkete göstermek için)

```
SEED_DEMO=true
```

Bu kadarı yeterlidir. Örnek başvurular, tedarikçiler, denetimler ve rol
hesapları hazır gelir; giriş ekranında demo hesapları görünür.

### Gerçek kullanım kurulumu

```
SEED_DEMO=false
SEED_ADMIN_EMAIL=kamercan.besikci@yanmar.com.tr
SEED_ADMIN_PASSWORD=BurayaGucluBirParolaYazin2026!
JWT_SECRET=en-az-32-karakterlik-rastgele-uzun-bir-metin-yazin
```

Örnek kayıt oluşturulmaz; yalnızca ürün grupları, sertifika listesi ve denetim
kontrol listesi yüklenir. Diğer kullanıcıları panelden **Kullanıcılar**
ekranından siz açarsınız.

### İsteğe bağlı ayarlar

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MAX_UPLOAD_MB` | `20` | Tek dosya için üst sınır |
| `SMTP_HOST` | boş | Girilmezse e-postalar yalnızca panelde **E-posta Kutusu**'na kaydedilir |
| `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | SMTP kullanacaksanız |
| `MAIL_FROM` | Yanmar… | Gönderen adı |
| `NOTIFY_EMAILS` | boş | Yeni başvuruda haber verilecek iç adresler (virgülle) |
| `PUBLIC_BASE_URL` | otomatik | Kendi alan adınızı bağlarsanız `https://tedarikci.yanmar.com.tr` gibi |

> `PORT`, `DATA_DIR` ve alan adı Railway tarafından otomatik verilir —
> bunlara dokunmayın.

## Adım 5 — Alan adını üretin

1. Servis → **Settings** → **Networking** → **Generate Domain**.
2. Railway size `...up.railway.app` biçiminde bir adres verir.

Uygulama bu adresi otomatik algılar; e-postalardaki takip ve belge yükleme
bağlantıları doğru adrese işaret eder.

## Adım 6 — Yönetici parolasını alın

`SEED_ADMIN_PASSWORD` **tanımlamadıysanız**, sistem güçlü bir parola üretir ve
**yalnızca ilk açılış loglarında bir kez** gösterir:

1. Servis → **Deployments** → en üstteki dağıtım → **View Logs**.
2. Şu kutuyu arayın:

```
──────────────────────────────────────────────────────────
  YÖNETİCİ HESABI OLUŞTURULDU
  E-posta : admin@yanmar.com.tr
  Parola  : xxxxx-xxxxx-xxxxx!7
──────────────────────────────────────────────────────────
```

3. Parolayı kaydedin, giriş yapın ve **Ayarlar → Şifremi değiştir** ile
   kendi parolanızı belirleyin.

---

## Yayına aldıktan sonra kontrol listesi

Adresiniz `https://<sizin-adresiniz>.up.railway.app` olsun:

| Kontrol | Adres | Beklenen |
|---|---|---|
| Tanıtım sayfası | `/` | Yanmar sayfası, sağ üstte **Business Partner** butonu |
| Başvuru formu | butona tıklayın | Form açılır, TR/EN geçişi çalışır |
| Başvuru takip | `/basvuru-takip` | Referans no + e-posta ile sorgulama |
| Yönetim paneli | `/yonetim` | Giriş ekranı |
| Sağlık kontrolü | `/api/health` | `{"ok":true,...}` |

Demo modunda giriş için (hepsi hazır gelir):

| Rol | E-posta | Parola |
|---|---|---|
| Satınalma / Moderatör | `satinalma@yanmar.com.tr` | `Moderator123!` |
| Kalite Birimi | `kalite@yanmar.com.tr` | `Kalite123!` |
| Yönetici | `admin@yanmar.com.tr` | log'daki üretilmiş parola |

---

## Sık karşılaşılan durumlar

**"Her dağıtımdan sonra veriler siliniyor."**
Kalıcı disk (Adım 3) eklenmemiş veya mount path `/data` değil.
Servis → Volume ayarını kontrol edin.

**"Giriş yapamıyorum, parolayı kaçırdım."**
Variables'a `SEED_ADMIN_PASSWORD` ekleyip **yeni bir e-posta** ile
`SEED_ADMIN_EMAIL` tanımlayın ve yeniden dağıtın; yeni bir yönetici hesabı
oluşur. (Var olan hesabın parolası bu yolla değişmez — mevcut hesabın parolasını
başka bir yönetici panelden sıfırlayabilir.)

**"Demo verilerini kaldırmak istiyorum."**
`SEED_DEMO=false` yapmak yeni kayıt üretilmesini durdurur ama **var olan demo
kayıtları silmez.** Tamamen temiz başlamak için: Volume'ü silip yeniden
oluşturun (tüm veriler gider) veya demo başvuruları panelden tek tek silin.

**"E-posta gitmiyor."**
`SMTP_HOST` tanımlı değilse bu beklenen davranıştır. Tüm bildirimler panelde
**E-posta Kutusu** ekranında görüntülenir — demo için genelde yeterlidir.
Gerçek gönderim için SMTP bilgilerini girin.

**"Build başarısız oldu."**
Loglarda `npm ci` veya `tsc` hatası varsa dalın güncel olduğundan emin olun.
Railway'de **Deployments → Redeploy** ile tekrar deneyin.

---

## Kendi alan adınızı bağlamak

1. Servis → **Settings → Networking → Custom Domain**.
2. Railway'in verdiği CNAME kaydını DNS'e ekleyin
   (örn. `tedarikci.yanmar.com.tr` → `...up.railway.app`).
3. Variables'a `PUBLIC_BASE_URL=https://tedarikci.yanmar.com.tr` ekleyin ki
   e-postalardaki bağlantılar bu adresi kullansın.

HTTPS sertifikasını Railway otomatik yönetir.

---

## Maliyet ve ölçek notu

- Railway'in Hobby planı bu uygulama için yeterlidir (tek servis, küçük disk).
- Veritabanı SQLite'tır ve kalıcı diskte tek dosya olarak durur — yedeklemek
  için Volume'den `portal.db` dosyasını indirmeniz yeterlidir.
- Eşzamanlı kullanıcı sayısı çok artarsa PostgreSQL'e geçiş yolu
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) içinde anlatılmıştır.
- `numReplicas` **1** olmalıdır (kalıcı disk tek servise bağlanır);
  `railway.json` bunu zaten böyle ayarlar.

---

## Railway dışında

Kök dizindeki `Dockerfile` standarttır; Render, Fly.io, DigitalOcean App
Platform veya kendi sunucunuzdaki Docker üzerinde de aynı şekilde çalışır.
Tek gereklilik: `/data` yoluna kalıcı bir disk bağlamak ve servisin dinlediği
portu (`PORT`) dışarı açmak.
