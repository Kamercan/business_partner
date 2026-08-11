# Yanmar Türkiye — Business Partner Portal

B2B tedarikçi başvuru ve yaşam döngüsü yönetim portalı.

Farklı kanallardan (web formu, e-posta, LinkedIn, EYDEP, TurkishExporter) gelen tedarikçi
başvurularını **tek merkezde toplar**, ürün grubuna göre **filtrelenebilir** hale getirir,
**Excel'e aktarır** ve kalite onay süreçlerini uçtan uca **dijitalleştirir**.

> Projenin çıkış noktası: *"Bu büyük veri havuzunda aradığımızı bulamıyoruz; örneğin, sadece
> hidrolikçileri filtreleyip göremiyorum."* — Portal bunu tek tıkla çözer ve süreci
> başvurudan onaylı tedarikçiye, oradan sözleşme ve uygunsuzluk takibine kadar taşır.

---

## Hızlı başlangıç

```bash
npm install                 # bağımlılıklar (server + web)
cp server/.env.example server/.env
npm run db:seed             # şema + taksonomi + demo veriler
npm run dev                 # API :4000 · Web :5173
```

Tarayıcıda <http://localhost:5173> adresini açın.

### Demo hesapları

| Rol | E-posta | Şifre | Ne yapabilir |
|---|---|---|---|
| Satınalma / Moderatör | `satinalma@yanmar.com.tr` | `Moderator123!` | Başvuruları değerlendirir, onaylar, Excel'e aktarır, sözleşme açar |
| Kalite Birimi | `kalite@yanmar.com.tr` | `Kalite123!` | Denetim yapar, A/B/C/D notu verir, uygunsuzluk açar |
| Yönetici | `admin@yanmar.com.tr` | `Admin123!` | Tümü + kullanıcı ve taksonomi yönetimi |
| İzleyici | `izleme@yanmar.com.tr` | `Viewer123!` | Salt okunur raporlama |

> Üretime almadan önce `server/.env` içindeki `JWT_SECRET` değerini ve tüm demo şifrelerini
> mutlaka değiştirin.

### Önemli adresler

| Adres | Açıklama |
|---|---|
| `/` | Kurumsal tanıtım sayfası + **Business Partner** başvuru formu |
| `/basvuru-takip` | Tedarikçinin referans no + e-posta ile durum sorgulaması |
| `/portal/:token` | Tedarikçi self-servis alanı (hesapsız, süreli bağlantı) |
| `/yonetim` | Yönetim paneli |

---

## Faz bazında kapsam

### Faz 1 — Başvuru formu ve temel veritabanı ✅

- Kurumsal siteye eklenen **Business Partner** butonu ve tek adımlı başvuru formu
- Firma bilgileri, iletişim, **çoklu ürün grubu seçimi** (açıklama baloncuklarıyla),
  kalite sertifikaları, referanslar ve firma tanıtımı
- **Gerçek dosya yükleme**: şirket sunumu, ürün kataloğu, ISO 9001, diğer sertifikalar, mali tablo
- Tam **TR/EN** dil desteği
- **KVKK onayı**, rıza metni sürümü, zaman damgası ve IP kaydı ile birlikte saklanır
- Başvuru referans numarası üretimi (`YTM-BP-2026-00001`) ve otomatik onay e-postası

### Faz 2 — Moderatör yönetim paneli ✅

- Başvuruların **tablo (grid)** görünümü; sayfalama ve sıralama
- **Ürün grubu, sertifika, durum, ülke, kaynak ve serbest metin** ile filtreleme
  (filtreler URL'e yazılır — görünüm paylaşılabilir ve yer imlenebilir)
- **Excel'e aktarım**: ekrandaki filtrenin birebir aynısı, Türkçe etiketlerle;
  ürün grubu özeti ve hangi filtrelerle alındığını gösteren rapor bilgisi sayfası ile
- Başvuru detayı: tüm alanlar, belgeler, notlar, denetim izi
- **Toplu işlem** (birden çok başvuruyu aynı anda kaliteye gönderme / reddetme)
- Sorumlu atama, öncelik, dahili notlar

### Faz 3 — İş akışı ve kalite denetim modülü ✅

- Moderatör onayladığında **kalite biriminin ekranına otomatik denetim görevi düşer**
- Denetim planlama (tarih, yöntem, denetçi ataması)
- **Ağırlıklı kontrol listesi** (IATF 16949 esinli, 7 bölüm / 22 madde) ile puanlama;
  anlık ağırlıklı skor ve **A/B/C/D** not projeksiyonu
- Gerekçe zorunluluğuyla not ezme (override) imkânı
- Denetim tamamlandığında sonuç satınalmaya görev olarak geri döner
- Onaylananlar **onaylı tedarikçi havuzuna** aktarılır (C notu → şartlı onay)

### Faz 4 — Tedarikçi ilişkileri yönetimi (SRM) ✅

- **Sözleşme yönetimi**: NDA, çerçeve, fiyat, kalite anlaşmaları; süre takibi ve
  yenileme hatırlatma görevleri
- **Uygunsuzluk raporları (NCR)** 8D akışıyla: açma → tedarikçi cevabı → inceleme → kapatma
  (kök neden ve düzeltici faaliyet girilmeden kapatılamaz)
- **Karşılıklı güvenli dosya paylaşımı**: belge bazlı görünürlük (dahili / tedarikçiyle paylaşılan)
- Tedarikçi performans göstergeleri (OTD, PPM), periyodik denetim takibi

---

## Brief dışında eklenen, sistemi kullanışlı kılan özellikler

Bunlar görüşmede istenmedi ancak sistemin gerçekten kullanılabilir olması için eklendi:

| Özellik | Neden |
|---|---|
| **Mükerrer başvuru tespiti** | Aynı firma birden çok kanaldan başvuruyor. Firma adı ticaret unvanı eklerinden arındırılarak (`ABC Metal San. Tic. Ltd. Şti.` ≡ `ABC METAL SANAYI TICARET LIMITED`), vergi no ve e-posta ile eşleştirilir; kayıt işaretlenir. |
| **CSV içe aktarım** | EYDEP / TurkishExporter / fuar listeleri aynı havuza aktarılır. Türkçe sütun başlıkları otomatik tanınır, önizleme ve mükerrer ayıklama yapılır. |
| **Başvuru takip sayfası** | Tedarikçi "başvurum ne oldu?" diye telefon etmez; referans no + e-posta ile kendi durumunu görür. Satınalmanın üzerindeki soru yükünü azaltır. |
| **Tedarikçi self-servis bağlantısı** | Faz 4'ün dosya alışverişi ve NCR cevapları için tedarikçiye hesap açmadan (görüşmedeki "tedarikçinin panele ihtiyacı yok" kuralını bozmadan) süreli, tek varlığa kapsamlı imzalı bağlantı verilir. |
| **İş sırası (görev kuyruğu)** | Faz 3'teki "kalite ekranına task düşmeli" ihtiyacının genelleştirilmiş hâli: her birim kendi kuyruğunu, terminleri ve gecikmeleri görür. |
| **Denetim izi (activity log)** | ISO 9001 / IATF 16949 denetimlerinde "bu kararı kim, ne zaman, hangi gerekçeyle verdi?" sorusunun cevabı. Arayüzden silinemez. |
| **E-posta kutusu** | SMTP kurulmadan da sistem çalışır; tüm bildirimler kayda geçer ve panelden görüntülenir. Demo ve devreye alma için kritik. |
| **Doluluk skoru** | Başvurular 0–100 arası puanlanır; moderatör 200 kayıtlık havuzda hangisine önce bakacağını bilir. |
| **SLA takibi ve pano** | Hedef sürenin aşıldığı başvurular panoda öne çıkar; ortalama değerlendirme ve denetim süreleri ölçülür. |
| **Yönetilebilir taksonomi** | Yeni ürün grubu/sertifika eklemek kod değişikliği gerektirmez; forma ve filtrelere anında yansır. |
| **KVKK araçları** | Rıza sürümü + zaman damgası + IP kaydı, tedarikçiye şeffaf durum bilgisi ve yönetici için kalıcı silme (unutulma hakkı). |
| **Anti-spam** | Bal küpü alanı, IP bazlı hız sınırı ve 24 saatlik tekrar başvuru koruması. |

---

## Teknoloji

| Katman | Seçim | Gerekçe |
|---|---|---|
| Sunucu | Node.js 20+ · TypeScript · Express | Yaygın, işe alımı kolay, tek dil |
| Veritabanı | SQLite (better-sqlite3, WAL) | Tek dosya, sıfır kurulum; şema standart SQL olduğu için PostgreSQL'e taşınabilir |
| Doğrulama | Zod | Şema tek yerde, hata mesajları Türkçe |
| Kimlik | JWT + bcrypt, rol bazlı yetki | Basit, durumsuz |
| Excel | ExcelJS | Gerçek `.xlsx`, biçimlendirme ve koşullu renk desteği |
| İstemci | React 18 · TypeScript · Vite | Hızlı geliştirme, statik çıktı |
| Stil | Elle yazılmış CSS (tasarım tokenları) | Prototipteki Yanmar kimliği birebir korundu, ek bağımlılık yok |

Harici servis bağımlılığı yoktur; SMTP opsiyoneldir.

---

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | API + web geliştirme sunucuları |
| `npm run build` | Üretim derlemesi (`server/dist`, `web/dist`) |
| `npm start` | Üretim sunucusu — `web/dist` varsa aynı porttan servis edilir |
| `npm run db:seed` | Referans veriler + demo kayıtlar |
| `npm run db:seed -- --no-demo` | Yalnızca taksonomi ve yönetici hesabı (gerçek kurulum) |
| `npm run db:reset` | Veritabanını ve yüklenen dosyaları siler (yalnızca geliştirme) |
| `npm run typecheck` | Tip kontrolü (server + web) |

---

## Proje yapısı

```
server/
  src/
    db/            şema (schema.sql), migrasyon, seed, reset
    lib/           iş kuralları: puanlama, denetim izi, görevler,
                   bildirimler, Excel, metin normalizasyonu
    middleware/    kimlik/yetki, dosya yükleme, hız sınırı
    modules/       uç noktalar (başvuru, denetim, tedarikçi,
                   sözleşme, NCR, belge, görev, portal, içe aktarım)
web/
  src/
    pages/public/  tanıtım sayfası, başvuru formu, takip, self-servis
    pages/admin/   pano, havuz, detaylar, denetim, SRM, sistem
    components/    ortak arayüz bileşenleri
    i18n/          TR/EN sözlük
docs/              mimari, iş akışı, API referansı
```

Ayrıntılar için [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/WORKFLOW.md](docs/WORKFLOW.md) ve [docs/API.md](docs/API.md).

---

## Üretime alırken

1. `JWT_SECRET` için en az 32 karakterlik rastgele bir değer üretin (`openssl rand -base64 48`).
2. Tüm demo hesaplarının şifrelerini değiştirin veya hesapları pasifleştirin.
3. `NODE_ENV=production` ile çalıştırın (CSP ve güvenli çerez devreye girer).
4. HTTPS sonlandıran bir ters proxy (nginx/Caddy) arkasına alın.
5. SMTP bilgilerini girin; aksi hâlde bildirimler yalnızca kutuya kaydedilir.
6. `server/data/` (veritabanı) ve `server/storage/` (yüklenen belgeler) dizinlerini yedekleme
   kapsamına alın.
7. Eş zamanlı kullanıcı sayısı arttığında SQLite yerine PostgreSQL'e geçiş için
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) içindeki nota bakın.
