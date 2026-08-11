# API referansı

Taban adres: `/api` · Kimlik: `Authorization: Bearer <token>` (veya `bp_token` çerezi)

Hata gövdesi tek biçimlidir:

```json
{ "error": "Gönderilen veri geçersiz.", "code": "BAD_REQUEST",
  "details": [{ "field": "email", "message": "Geçerli bir e-posta adresi giriniz." }] }
```

---

## Kamuya açık uçlar

| Yöntem | Yol | Açıklama |
|---|---|---|
| `GET` | `/meta` | Ürün grupları, sertifikalar, sektörler, ülkeler, SLA süreleri. Form bu uçtan beslenir. |
| `POST` | `/applications` | Başvuru gönderimi (`multipart/form-data`). 5/saat/IP. |
| `POST` | `/portal/track` | `{ ref_no, email }` ile durum sorgulama. |
| `GET` | `/portal/:token` | Self-servis alan içeriği (başvuru / NCR / tedarikçi). |
| `POST` | `/portal/:token/documents` | Tedarikçi belge yükleme. |
| `POST` | `/portal/:token/messages` | Tedarikçi mesajı. |
| `POST` | `/portal/:token/ncr-response` | 8D düzeltici faaliyet cevabı. |
| `POST` | `/auth/login` | Giriş. 10/15dk. |
| `GET` | `/health` | Sağlık kontrolü. |

### `POST /applications` alanları

Zorunlu: `company_name`, `tax_id`, `sector`, `contact_name`, `email`, `phone`, `country`,
`city`, `categories` (JSON dizi, en az 1), `kvkk_consent=true`

Opsiyonel: `founded_year`, `employee_band`, `revenue_band`, `website`, `sector_other`,
`contact_position`, `country_other`, `address`, `references_text`, `about`,
`category_other`, `certifications` (JSON dizi)

Dosya alanları: `presentation`, `catalog`, `iso9001`, `cert_other` (çoklu), `financial`

Yanıt: `201 { "ref_no": "YTM-BP-2026-00001", "completeness": 78 }`
Aynı firma 24 saat içinde tekrar başvurursa `409 CONFLICT`.

---

## Başvurular (`/admin/applications`)

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| `GET` | `/` | tümü | Filtreli liste |
| `GET` | `/export` | tümü | Excel (aynı filtreler) |
| `GET` | `/:id` | tümü | Detay + belgeler, denetimler, notlar, izin verilen geçişler |
| `PATCH` | `/:id` | MOD/QUA | Sorumlu, öncelik, kaynak, karar notu |
| `POST` | `/:id/status` | MOD/QUA | Durum geçişi (iş akışını tetikler) |
| `POST` | `/bulk-status` | MOD | Toplu durum değişikliği (en fazla 200) |
| `POST` | `/:id/request-info` | MOD/QUA | Süreli bağlantıyla bilgi/belge talebi |
| `POST` | `/:id/notes` | MOD/QUA | Dahili not |
| `DELETE` | `/:id` | ADMIN | KVKK kalıcı silme |

### Liste parametreleri

| Parametre | Örnek | Açıklama |
|---|---|---|
| `q` | `hidrolik` | Firma, referans, e-posta, vergi no, şehir, referanslar, tanıtım |
| `category` | `hidrolik,disli` | Ürün grubu |
| `categoryMode` | `any` \| `all` | Herhangi biri / hepsi birden |
| `cert` | `iso9001,iatf` | Seçilen **tüm** sertifikalara sahip olanlar |
| `status` | `NEW,IN_REVIEW` | Durum |
| `country` / `sector` / `source` | `tr` | Çoklu değer virgülle |
| `assignedTo` / `unassigned` | `3` / `true` | Sorumlu |
| `minCompleteness` | `60` | Doluluk skoru alt sınırı |
| `duplicatesOnly` | `true` | Yalnızca mükerrer işaretliler |
| `dateFrom` / `dateTo` | `2026-01-01` | Başvuru tarihi aralığı |
| `sort` / `dir` | `created_at` / `desc` | Sıralama |
| `page` / `pageSize` | `1` / `25` | Sayfalama (en fazla 200) |

Örnek — hidrolik veya güç aktarım grubunda, IATF belgeli, Türkiye'deki onaylı firmalar:

```
GET /api/admin/applications?category=hidrolik,disli&cert=iatf&country=tr&status=APPROVED
```

---

## Denetimler (`/admin/audits`)

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| `GET` | `/` | tümü | Denetim kuyruğu (`status`, `mine`, `q`) |
| `GET` | `/:id` | tümü | Detay + kontrol listesi + anlık puan |
| `GET` | `/templates/active` | tümü | Aktif kontrol listesi şablonu |
| `POST` | `/` | QUA/MOD | Periyodik/özel denetim açma |
| `PATCH` | `/:id` | QUA | Planlama, denetçi ataması, yöntem |
| `PUT` | `/:id/scores` | QUA | Madde puanları (kısmi kayıt destekli) |
| `POST` | `/:id/complete` | QUA | Tamamlama; puan ve A/B/C/D kesinleşir |

`complete` gövdesi: `recommendation` (zorunlu), `strengths`, `findings`, `method`,
`grade_override` + `override_reason` (birlikte zorunlu).
Tüm maddeler puanlanmadan tamamlanamaz.

---

## Tedarikçiler, sözleşmeler, uygunsuzluklar

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| `GET` | `/admin/suppliers` | tümü | Onaylı havuz (`q`, `grade`, `status`, `category`, `country`) |
| `GET` | `/admin/suppliers/export` | tümü | Excel |
| `GET` | `/admin/suppliers/:id` | tümü | Detay + sözleşme, NCR, denetim, belge |
| `PATCH` | `/admin/suppliers/:id` | MOD/QUA | Durum, not, OTD/PPM, kategoriler |
| `GET` | `/admin/contracts` | tümü | Liste (`expiring=true` süresi yaklaşanlar) |
| `POST` | `/admin/contracts` | MOD | Yeni sözleşme |
| `PATCH` | `/admin/contracts/:id` | MOD | Güncelleme |
| `POST` | `/admin/contracts/scan-expiring` | MOD | Süre taraması + yenileme görevleri |
| `GET` | `/admin/ncrs` | tümü | Liste (`status`, `severity`, `overdue`) |
| `POST` | `/admin/ncrs` | QUA/MOD | NCR açma (tedarikçiye bağlantı gönderir) |
| `PATCH` | `/admin/ncrs/:id` | QUA/MOD | 8D alanları ve durum |
| `POST` | `/admin/ncrs/:id/resend-link` | QUA/MOD | Cevap bağlantısını yeniden gönder |

---

## Belgeler, görevler, sistem

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| `POST` | `/admin/documents` | MOD/QUA | Yükleme (`owner_type`, `owner_id`, `kind`, `visibility`) |
| `GET` | `/admin/documents/:id/download` | tümü | Güvenli indirme (izlenir) |
| `PATCH` | `/admin/documents/:id` | MOD/QUA | Görünürlük (dahili ↔ paylaşılan) |
| `DELETE` | `/admin/documents/:id` | ADMIN | Silme |
| `GET` | `/admin/tasks` | tümü | İş sırası (`myQueue`, `mine`, `overdue`, `status`) |
| `PATCH` | `/admin/tasks/:id` | yazma | Durum, sorumlu, termin |
| `POST` | `/admin/tasks/:id/claim` | yazma | Görevi üstlen |
| `GET` | `/admin/stats/dashboard` | tümü | Pano göstergeleri |
| `GET` | `/admin/stats/outbox` | tümü | E-posta kutusu |
| `GET` | `/admin/stats/activity` | tümü | Sistem geneli denetim izi |
| `POST` | `/admin/imports/applications` | MOD | CSV içe aktarım (`dry_run=true` önizleme) |
| `GET` | `/admin/imports/template` | MOD | Örnek CSV şablonu |
| `GET` | `/admin/users` | tümü | Atama listesi |
| `GET` | `/admin/users/all` | ADMIN | Tüm kullanıcılar |
| `POST` | `/admin/users` | ADMIN | Kullanıcı oluşturma |
| `PATCH` | `/admin/users/:id` | ADMIN | Rol, durum, şifre sıfırlama |
| `GET` | `/meta/settings` | tümü | Ayarlar |
| `PUT` | `/meta/settings` | ADMIN | Ayar güncelleme |
| `POST` | `/meta/categories` | ADMIN | Ürün grubu ekleme/güncelleme |
| `DELETE` | `/meta/categories/:code` | ADMIN | Pasifleştirme |

---

## Durum kodları

| Kod | Anlamı |
|---|---|
| `400 BAD_REQUEST` | Doğrulama hatası veya geçersiz durum geçişi (`details` alan bazlı) |
| `401 UNAUTHORIZED` | Oturum yok / süresi doldu / hesap pasif |
| `403 FORBIDDEN` | Rol yetersiz |
| `404 NOT_FOUND` | Kayıt yok |
| `409 CONFLICT` | Mükerrer başvuru veya e-posta |
| `413 FILE_TOO_LARGE` | Dosya boyutu sınırı aşıldı |
| `429 RATE_LIMITED` | Hız sınırı |
