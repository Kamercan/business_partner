# Piyasa & Maliyet Göstergeleri Panosu

Asgari ücret, sac metal (HRC/CRC/paslanmaz), hurda demir, akaryakıt, navlun,
elektrik/doğal gaz ve enflasyon göstergelerini **tek ekranda**, geçmişiyle
birlikte ve **her sayının kaynağı belli** olacak şekilde izleyen kurum içi
uygulama.

Kendi başına çalışır; bu depodaki Yanmar Business Partner portalından bağımsızdır.

```bash
cd market-monitor
npm install
cp .env.example .env      # anahtarlar isteğe bağlı — bkz. "Anahtarsız ne çalışır"
npm run dev               # API :4100 · arayüz :5174
```

---

## Neden bir tablo değil de bu

Bu tür veriler genelde birinin bilgisayarındaki bir Excel dosyasında birikir.
Sorun sayıların kendisi değil, **arkalarındaki izin kaybolmasıdır**: altı ay
sonra "bu hurda fiyatı nereden geldi, hangi tarihli değerlendirmeydi, brüt mü
CFR mi?" sorusunun cevabı kalmaz. Bu uygulamanın tasarım ilkesi tek cümlede:

> Hiçbir sayı, kaynağı olmadan içeri girmez ve hiçbir kaynak, doğrulanmadan
> "doğrulanmış" görünmez.

Pratikte bunun üç sonucu var:

1. **Üreten kurum ile erişim kanalı ayrılır.** ABD çelik ÜFE'sini BLS üretir,
   FRED sadece dağıtır. Panoda "BLS" yazar, kaynak sayfasında ise erişimin
   FRED üzerinden olduğu ayrıca gösterilir.
2. **Elle girilen her değer kaynak referansı ister.** Referanssız satır
   API tarafından reddedilir — arayüzden de, CSV'den de.
3. **Seri kodları körü körüne doğru varsayılmaz.** `npm run sources:check`
   her seriyi kaynağına karşı canlı sorgular; yalnızca cevap verenler
   «Doğrulandı» rozeti alır.

---

## Kapsanan göstergeler ve kaynakları

Kaynak seçiminde kural: **veriyi üreten kurum varsa o kullanılır.** Fiyat bir
istatistik değil piyasa değerlendirmesiyse (hurda, sac, navlun), sektörün
fiilen referans aldığı kuruluş kaynaktır — bunların çoğu aboneliklidir ve
uygulamaya CSV/elle, referansıyla girilir.

| Kategori | Gösterge | Kaynak | Erişim |
|---|---|---|---|
| **Enflasyon** | TÜFE, Yİ-ÜFE, ana metal sanayi ÜFE | **TÜİK** | TCMB EVDS (anahtar) |
| | Ülke bazlı yıllık enflasyon | **IMF** (WEO) | açık API |
| | Euro Bölgesi / Almanya HICP | **Eurostat** | açık API |
| | ABD TÜFE | **BLS** | FRED |
| **Asgari ücret** | Türkiye brüt / net / işverene maliyet | **Asgari Ücret Tespit Komisyonu** (Resmî Gazete) | tohum veri + arayüzden ekleme |
| | AB ülkeleri + Türkiye, EUR | **Eurostat** (`earn_mw_cur`) | açık API |
| | ABD federal asgari ücret | **US DoL** | FRED |
| **Sac metal** | HRC, CRC (Türkiye ex-works) | **SteelOrbis / MEPS / Kallanish** | CSV/elle |
| | Paslanmaz 304 + alaşım ek bedeli | **MEPS / üretici ilanları** | CSV/elle |
| | Nikel, demir cevheri | **IMF** emtia fiyatları | FRED |
| | ABD çelik ÜFE, AB ana metal ÜFE | **BLS**, **Eurostat** | FRED / açık API |
| **Hurda** | HMS 1&2 (80:20) CFR Türkiye | **Platts / LME** | CSV/elle |
| | ABD hurda ÜFE | **BLS** | FRED |
| **Akaryakıt** | Brent spot | **EIA** | FRED |
| | Türkiye benzin / motorin pompa | **EPDK** | CSV/elle |
| | ABD benzin | **EIA** | FRED |
| **Navlun** | FBX küresel + Çin→Akdeniz | **Freightos / Baltic Exchange** | CSV/elle |
| | Drewry WCI, SCFI | **Drewry**, **Şanghay Denizcilik Borsası** | CSV/elle |
| | ABD karayolu ÜFE | **BLS** | FRED |
| **Enerji** | Türkiye elektrik PTF | **EPİAŞ** | Şeffaflık API (kayıt) |
| | BOTAŞ sanayi doğal gaz | **BOTAŞ** | CSV/elle |
| | AB ve Türkiye sanayi elektrik/gaz | **Eurostat** | açık API |
| | Henry Hub, Avrupa gaz | **EIA**, **IMF** | FRED |
| **Kur** | USD/TRY, EUR/TRY | **TCMB** gösterge kuru | açık XML + ECB (geçmiş) |

Tam liste, lisanslar ve doğrulama linkleri uygulamanın **Kaynaklar** sayfasında.

### Neden bazı fiyatlar "elle"?

Çünkü ücretsiz ve resmî bir API'si **yok**. Hurda CFR Türkiye değerlendirmesi,
HRC/CRC fiyatları ve konteyner navlun endeksleri ticari kuruluşların
abonelikli ürünleridir; EPDK ve BOTAŞ ise verilerini PDF/tablo olarak
yayımlar. Uygulama bunları "tahmin etmek" yerine, kaynağını kayda geçirerek
içeri almanızı ister. Bu bir eksiklik değil, dürüst olan tasarımdır.

---

## Anahtarsız ne çalışır

`.env` hiç doldurulmadan çalışan seriler:

- **IMF** — ülke bazlı yıllık enflasyon (anahtarsız)
- **Dünya Bankası** — Türkiye enflasyonu, uzun geçmiş (anahtarsız)
- **Eurostat** — asgari ücret, HICP, sanayi elektrik/gaz fiyatları (anahtarsız)
- **FRED** — Brent, Henry Hub, nikel, demir cevheri, ABD ÜFE serileri
  (anahtarsız CSV ucu üzerinden)
- **Kur** — USD/TRY ve EUR/TRY (TCMB XML + ECB, anahtarsız)
- **Asgari ücret** — tohum veriyle birlikte gelir

Anahtar gerektirenler: **EVDS** (Türkiye TÜFE/ÜFE) ve **EPİAŞ** (elektrik PTF).
İkisi de ücretsizdir; alma adresleri `.env.example` içinde.

---

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | API + arayüz, canlı yeniden yükleme |
| `npm run build` && `npm start` | Üretim derlemesi; arayüz API ile aynı porttan servis edilir |
| `npm run ingest` | Tüm serileri kaynağından çeker |
| `npm run ingest -- --only brent,fx.usdtry` | Belirli serileri çeker |
| `npm run ingest -- --missing` | Yalnızca hiç verisi olmayanları çeker |
| **`npm run sources:check`** | **Her seriyi kaynağına karşı canlı sınar** ve doğrulananları işaretler |
| `npm run evds:find -- "üfe"` | EVDS seri kodunu canlı arar (kod değişmişse) |
| `npm run test` | Birim testler (dönüşümler, dönem/sayı ayrıştırma) |
| `npm run db:reset` | Veritabanını sıfırlar |

### İlk kurulumda önerilen sıra

```bash
npm install
cp .env.example .env
npm run sources:check     # hangi kaynak çalışıyor, hangisi anahtar bekliyor
npm run ingest            # veriyi çek
npm run dev
```

`sources:check` çıktısı size dürüst bir tablo verir: `✓ TAMAM` doğrulandı,
`🔑 ANAHTAR` yapılandırma bekliyor, `✎ ELLE` CSV/elle giriş serisi,
`✗ HATA` kaynak yanıt vermedi (kod değişmiş olabilir — doğrulama linki basılır).

---

## Arayüz

- **Pano** — kategori kategori gösterge kartları: son değer, yıllık değişim,
  mini eğri, kaynak ve tazelik rozeti.
- **Karşılaştır** — en fazla 8 seri, ortak zaman ekseninde. Ham değer, yıllık %,
  endeks (=100) veya birikimli %; TL/USD/EUR çevrimi; grafik ve tablo görünümü;
  CSV indirme.
- **Seri detayı** — tam geçmiş, özet istatistikler, kaynak künyesi ve
  **dönem bazlı belge referansları** (hangi değer hangi karara/bültene dayanıyor).
- **Kaynaklar** — kurum kurum lisans, erişim koşulu, doğrulama linki, canlı sağlık
  durumu ve o kurumun ürettiği ama başka kanaldan alınan göstergeler.
- **Veri girişi** — elle yönetilen seriler için tek değer veya CSV içe aktarma.

### Grafiklerde iki eksen yoktur

Birimleri farklı iki seriyi tek grafikte ham değerle göstermek olmayan bir
ilişki uydurur. Uygulama bu durumu algılar, serileri ortak bir tabana
(=100) endeksler ve **neden endekslediğini ekranda yazar**. Renkler seriye
sabitlenir — listeden bir seri çıkarmak kalanları yeniden boyamaz — ve palet
renk körlüğü için doğrulanmıştır. Her grafiğin tablo karşılığı vardır.

---

## Veri modeli

Bütün gözlemler tek biçimde saklanır: **dönem başlangıcı** (`YYYY-MM-DD`) +
değer. Günlük, haftalık, aylık, altı aylık ve yıllık seriler böylece aynı
eksende hizalanır.

| Tablo | İçerik |
|---|---|
| `sources` | Kurum, katman (üretici/ayna/piyasa referansı/kurum içi), lisans, erişim |
| `series` | Gösterge tanımı, bağlayıcı, kaynak parametreleri, doğrulama linki |
| `observations` | `(series_id, period) → value`, revizyon damgasıyla |
| `manual_entries` | Elle/CSV girişlerin izi: değer + **kaynak referansı** + kim/ne zaman |
| `fetch_runs` | Her çekme denemesinin sonucu ve hata mesajı |

Veritabanı SQLite'tır (`data/market.db`); yedeklemek için dosyayı kopyalamak yeterlidir.

---

## Yeni gösterge eklemek

`src/server/catalog/series.ts` içine bir kayıt ekleyin:

```ts
S({
  id: 'tr.ppi.machinery',
  category: 'inflation',
  nameTr: 'Türkiye Yİ-ÜFE — makine imalatı',
  nameEn: 'Türkiye PPI — machinery',
  unit: 'endeks', currency: null, freq: 'monthly', geo: 'TR',
  sourceId: 'evds', producerSourceId: 'tuik',
  connector: 'evds', params: { code: 'TP.TUFE1YI.S28' },
  verifyUrl: 'https://evds2.tcmb.gov.tr/index.php?/evds/serieMarket',
  confidence: 'verify',
}),
```

Sonra `npm run ingest -- --only tr.ppi.machinery`. Kaynak API'si yoksa
`connector: 'manual'` yazın; seri Veri girişi sayfasında belirir.

Abonelik verisi düzenli bir CSV/URL veriyorsa kod yazmadan `csvurl`
bağlayıcısını kullanabilirsiniz:

```ts
connector: 'csvurl',
params: {
  url: 'https://ornek-servis/export.csv?from={{SINCE}}',
  dateColumn: 'date', valueColumn: 'price',
  header: 'Authorization: Bearer XYZ',
},
```

---

## Üretime alma

```bash
docker build -t piyasa-monitor .
docker run -p 8080:8080 -v piyasa-data:/data --env-file .env piyasa-monitor
```

`/data` yoluna kalıcı disk bağlayın. İnternete açıyorsanız `ADMIN_TOKEN`
tanımlayın — aksi halde yazma uçları korumasızdır.

---

## Bilinmesi gerekenler

- **Tohum asgari ücret verisi 2016–2025 dönemini kapsar.** Sonraki kararlar
  Veri girişi sayfasından eklenir; girilen değer tohum dosyasının üzerine yazar
  ve kaynak referansıyla saklanır. Üretimde kullanmadan önce mevcut satırları
  `seed/*.csv` içindeki resmî bağlantıdan teyit edin.
- **«Teyit gerekli» rozetli seriler** kaynağına karşı henüz canlı doğrulanmamıştır.
  Özellikle EVDS ve Eurostat filtre kodları zamanla değişebilir;
  `npm run sources:check` bunu tek komutta söyler, `npm run evds:find` doğru kodu bulur.
- **IMF serilerinde ileri yıllar tahmindir**, gerçekleşme değil.
- **Kur çevrimi** en son bilinen kuru ileri taşır; tatil ve hafta sonlarında
  bir önceki iş gününün kuru kullanılır.
- **Yıllık değişim**, bir yıl öncesine karşılık gelen gözlem yoksa hesaplanmaz —
  boşluklar uydurma oran üretmez.
