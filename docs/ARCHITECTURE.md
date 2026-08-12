# Mimari

## Genel yapı

```
   Tedarikçi (misafir)                         Yanmar ekibi
┌───────────────────────┐                ┌──────────────────────────┐
│ Tanıtım sayfası       │                │ Yönetim paneli (React)   │
│ Başvuru formu         │                │  · Pano / iş sırası      │
│ Başvuru takip         │                │  · Başvuru havuzu        │
│ Self-servis (token)   │                │  · Denetim / SRM         │
└──────────┬────────────┘                └────────────┬─────────────┘
           │  /api/applications, /api/portal          │ /api/admin/**
           │  (kimlik gerektirmez)                    │ (JWT + rol)
           └──────────────────┬───────────────────────┘
                              ▼
                  ┌───────────────────────┐
                  │  Express API (TS)     │
                  │  Zod doğrulama        │
                  │  Rol bazlı yetki      │
                  │  Hız sınırı           │
                  └───────────┬───────────┘
                              ▼
              ┌───────────────────────────────┐
              │ SQLite (WAL)  +  storage/     │
              │ · veri        · yüklenen dosya│
              └───────────────────────────────┘
```

Uygulama tek süreçte çalışır; harici servis bağımlılığı yoktur. SMTP opsiyoneldir —
tanımlı değilse bildirimler `mail_outbox` tablosuna yazılır ve panelden görüntülenir.

---

## Veri modeli

### Çekirdek

| Tablo | Rolü |
|---|---|
| `applications` | Başvuru formundan gelen kayıtlar. Durum makinesinin taşıyıcısı. |
| `application_categories` / `application_certifications` | Çoklu seçimler. Filtrelemenin dayandığı yer. |
| `suppliers` | Denetimden geçip onaylanan firmalar (onaylı havuz). |
| `audits` / `audit_scores` | Kalite denetimleri ve madde bazlı puanlar. |
| `audit_templates` / `audit_template_items` | Ağırlıklı kontrol listesi şablonu. |
| `contracts` | Faz 4 sözleşme yönetimi. |
| `ncrs` | Faz 4 uygunsuzluk raporları (8D alanlarıyla). |
| `documents` | Tüm ekler. `owner_type` + `owner_id` ile herhangi bir varlığa bağlanır. |
| `tasks` | Birimler arası iş sırası. |
| `notes` | Dahili notlar ve tedarikçiyle paylaşılan mesajlar. |
| `activity_log` | Değiştirilemez denetim izi. |
| `portal_tokens` | Tedarikçi self-servis erişimi (hash'lenmiş, süreli). |
| `mail_outbox` | Gönderilen/kaydedilen tüm bildirimler. |
| `categories` / `certifications` / `sectors` | Yönetilebilir taksonomi. |
| `settings` | Eşik değerler, SLA süreleri, kurum bilgileri. |

### Taksonomi neden ayrı tabloda?

Ürün grupları koda gömülü olsaydı, "bir grup daha ekleyelim" talebi her seferinde yazılım
sürümü gerektirirdi. Tablo hâlinde tutulduğu için yönetici panelden ekler, form ve filtreler
anında güncellenir. Silme yerine **pasifleştirme** yapılır; geçmiş başvurulardaki referans korunur.

### Belge sahipliği

`documents` tablosu `owner_type` (`APPLICATION` | `SUPPLIER` | `AUDIT` | `CONTRACT` | `NCR`)
ve `owner_id` ile çalışır. Böylece aynı yükleme, indirme ve yetki mantığı her varlıkta
tekrarlanmadan kullanılır. `visibility` alanı Faz 4'ün karşılıklı paylaşımını yönetir:

- `INTERNAL` — yalnızca Yanmar ekibi görür
- `SHARED` — tedarikçi self-servis bağlantısından da görür/indirir

---

## Güvenlik

| Konu | Uygulama |
|---|---|
| Kimlik | JWT (8 saat). Token geçerli olsa bile kullanıcı pasifse erişim reddedilir — yetki iptali anında etkilidir. |
| Yetki | `ADMIN` her şeyi kapsar; `MODERATOR` satınalma, `QUALITY` denetim/NCR, `VIEWER` salt okunur. Kontrol uç nokta seviyesinde. |
| Şifre | bcrypt (10 tur). Giriş denemelerinde kullanıcı yoksa da aynı süre harcanır (zamanlama saldırısı). |
| Dosya yükleme | MIME beyaz listesi, boyut sınırı, dosya adı asla diske yansıtılmaz (UUID + uzantı), SHA-256 hesaplanır. |
| Dosya indirme | Statik servis yok; yalnızca kimlik doğrulanmış uç noktadan, `nosniff` başlığıyla ve denetim izine kaydedilerek. |
| Dizin geçişi | Yükleme yolu `storage/<tür>/<id>/<uuid>` biçiminde sunucu tarafında kurulur; istemciden gelen ad kullanılmaz. |
| SQL enjeksiyonu | Tüm sorgular parametreli; sıralama sütunları beyaz listeden seçilir. |
| Hız sınırı | Başvuru 5/saat/IP, giriş 10/15dk, genel API 300/dk. |
| Spam | Gizli bal küpü alanı + 24 saat içinde aynı firma/e-posta tekrarına engel. |
| Başlıklar | Helmet; üretimde CSP, `frameAncestors: none`. |
| Self-servis bağlantı | Token hash'lenerek saklanır, süre sınırlı, tek varlığa kapsamlı, iptal edilebilir. |
| KVKK | Rıza metni sürümü + zaman + IP saklanır; yönetici kalıcı silme yapabilir, işlem denetim izine düşer. |

---

## Kararlar ve gerekçeleri

**SQLite seçimi.** Beklenen yük yılda birkaç bin başvuru ve onlarca eşzamanlı iç kullanıcıdır;
SQLite bu ölçekte fazlasıyla yeterli, kurulum ve yedekleme (tek dosya) çok basittir. Şema
standart SQL ile yazıldığı ve tüm erişim `server/src/db` üzerinden geçtiği için PostgreSQL'e
geçiş, bağlantı katmanının değiştirilmesi ve `datetime('now')` gibi birkaç fonksiyonun
karşılığıyla sınırlıdır.

**Tedarikçiye hesap açılmaması.** Görüşmede "tedarikçinin panele ihtiyacı yok" denmişti, ancak
Faz 4 karşılıklı dosya alışverişi ve NCR cevabı gerektiriyor. Çözüm: hesap/şifre yerine
e-postayla gönderilen, süreli ve tek kayda kapsamlı imzalı bağlantı. Tedarikçi hiçbir şey
öğrenmek zorunda kalmaz, Yanmar tarafında da parola yönetimi yükü doğmaz.

**Durum makinesinin merkezîleştirilmesi.** İzin verilen geçişler tek bir tabloda
(`STATUS_TRANSITIONS`) tanımlıdır. Arayüz butonları bu tablodan üretilir, sunucu da aynı
tabloyla doğrular. İş akışı değiştiğinde tek bir yer güncellenir ve arayüz kendiliğinden uyar.

**Filtre ve export'un aynı sorguyu paylaşması.** Ekranda görülen liste ile Excel çıktısı aynı
`buildWhere` fonksiyonundan geçer. "Ekranda 12 kayıt vardı, Excel'de 15 çıktı" tipi
tutarsızlık yapısal olarak mümkün değildir.

**Denetim puanının ağırlıklı olması.** Her maddenin ağırlığı vardır (örn. proses yeterliliği ×3,
karbon ayak izi ×1). Kısmi puanlama desteklenir; denetim ancak tüm maddeler puanlandığında
tamamlanabilir. Kalite uzmanı hesaplanan notu ezebilir ama **gerekçe zorunludur** ve gerekçe
denetim izine yazılır.

---

## Genişletme noktaları

- **ERP/SAP entegrasyonu**: `suppliers` tablosuna `erp_code` eklenip onay anında ERP'de
  tedarikçi kartı açan bir kanca yeterlidir.
- **RFQ / teklif modülü**: Faz 5 adayı. `suppliers` + `categories` eşleşmesi zaten var;
  bir `rfq` ve `rfq_responses` tablosu eklenerek onaylı havuzdan otomatik davet kurgulanabilir.
- **e-İmza**: `contracts.signed_at` alanı mevcut; imza servisi entegrasyonu bu alanı ve
  `documents` kaydını dolduracak şekilde eklenebilir.
- **Zamanlanmış görevler**: Sözleşme süre taraması şu an panelden tetiklenir
  (`POST /api/admin/contracts/scan-expiring`); bir cron ile gecelik çalıştırılabilir.
- **Denetim şablonu çeşitlendirme**: `audit_templates` çoklu şablonu destekler; ürün grubuna
  özel kontrol listeleri eklenebilir.
