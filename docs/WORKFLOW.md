# İş akışı

## Başvuru yaşam döngüsü

```
                 [Tedarikçi]                     [Satınalma / Moderatör]        [Kalite Birimi]
                      │
        Business Partner başvuru formu
                      │
                      ▼
                    NEW ──────────────────────────► havuzda listelenir, görev düşer
                      │                              │
                      │◄──── NEEDS_INFO ─────────────┤ ek bilgi/belge talebi (süreli bağlantı)
                      │                              │
                      │                          IN_REVIEW
                      │                              │
                      │                              ├──► REJECTED   (bildirim gider)
                      │                              ├──► ON_HOLD    (havuzda bekletilir)
                      │                              │
                      │                              └──► AUDIT_PENDING ──► denetim + görev üretilir
                      │                                                          │
                      │                                                    AUDIT_PLANNED
                      │                                                          │
                      │                                                  AUDIT_IN_PROGRESS
                      │                                                          │
                      │                                       ağırlıklı puanlama → A / B / C / D
                      │                                                          │
                      │                                                    AUDIT_DONE
                      │                              ┌───────────────────────────┘
                      │                              │  (karar görevi satınalmaya döner)
                      │                              ├──► APPROVED  ──► onaylı tedarikçi havuzu
                      │                              └──► DISQUALIFIED
```

Geçiş kuralları `server/src/lib/constants.ts` içindeki `STATUS_TRANSITIONS` tablosunda
tanımlıdır. Geçersiz bir geçiş denendiğinde API açıklayıcı bir hata döner ve hangi geçişlerin
mümkün olduğunu söyler.

### Otomatik tetiklenen işler

| Olay | Sonuç |
|---|---|
| Başvuru gönderildi | Tedarikçiye onay e-postası, satınalmaya bildirim, moderatör kuyruğuna görev (10 gün termin) |
| `AUDIT_PENDING`'e geçiş | Denetim kaydı açılır, kalite birimine görev düşer (30 gün termin), bildirim gider |
| Denetim planlandı | Başvuru `AUDIT_PLANNED` durumuna senkronize edilir |
| Puanlama başladı | Başvuru `AUDIT_IN_PROGRESS` durumuna geçer |
| Denetim tamamlandı | Not hesaplanır, başvuru `AUDIT_DONE` olur, satınalmaya yüksek öncelikli karar görevi düşer |
| `APPROVED`'a geçiş | Tedarikçi kaydı açılır, ürün grupları taşınır, denetim ilişkilendirilir, **tedarikçiye portal daveti gider** (parolasını kendisi belirler) |
| Bilgi talebi | Tedarikçiye 30 gün geçerli yükleme bağlantısı, moderatöre takip görevi |
| NCR açıldı | Tedarikçiye 8D cevap bağlantısı, kaliteye takip görevi |
| Tedarikçi cevap verdi | NCR `SUPPLIER_RESPONDED` olur, kaliteye bildirim gider |
| Tedarikçi belge yükledi | İlgili birime inceleme görevi düşer |

---

## Roller ve yetkiler

Satınalma (MODERATOR) ve kalite (QUALITY) **ayrı birimlerdir**: her karar tek bir
birimin yetkisindedir, diğeri o kararı ekrandan da API'den de veremez.

| İşlem | ADMIN | MODERATOR | QUALITY | VIEWER |
|---|:--:|:--:|:--:|:--:|
| Başvuru listeleme / detay / Excel | ✓ | ✓ | ✓ | ✓ |
| İncelemeye alma, bilgi bekletme, beklemeye alma | ✓ | ✓ | — | — |
| **Onayla → Kaliteye gönder** | ✓ | ✓ | — | — |
| **Onaylı tedarikçi yap** / reddetme / eleme | ✓ | ✓¹ | — | — |
| Denetim aşamaları (planlandı → başladı → tamamlandı) | ✓ | — | ✓ | — |
| Toplu işlem | ✓ | ✓ | — | — |
| Bilgi/belge talebi | ✓ | ✓ | ✓ | — |
| Denetim açma, planlama ve puanlama | ✓ | — | ✓ | — |
| Denetimi tamamlama | ✓ | — | ✓ | — |
| Tedarikçi: ticari durum, iletişim, kategoriler | ✓ | ✓ | — | — |
| Tedarikçi: kalite notu, OTD, PPM, sonraki denetim | ✓ | — | ✓ | — |
| Sözleşme oluşturma | ✓ | ✓ | — | — |
| NCR açma / güncelleme / kapatma / not | ✓ | — | ✓ | — |
| Belge yükleme / paylaşma | ✓ | ✓ | ✓ | — |
| Belge silme | ✓ | — | — | — |
| Kullanıcı ve taksonomi yönetimi | ✓ | — | — | — |
| Başvuru kalıcı silme (KVKK) | ✓ | — | — | — |

¹ Moderatör onay/eleme kararını ancak **tamamlanmış bir kalite denetimi varsa** verebilir.
Denetimsiz onay sistem tarafından engellenir.

Kaynak tablolar: durum kararları `STATUS_ROLES` (`server/src/lib/constants.ts`),
tedarikçi alanları `SUPPLIER_FIELD_OWNER` (`server/src/modules/suppliers.routes.ts`).
Yetkisiz bir birim denediğinde sunucu `403` ve
*"Bu karar başka bir birimin yetkisindedir."* döner.

### İş üstlenme

Bir birime birden çok hesap bağlıdır (demoda her birimde iki koltuk). Yeni iş
**birimin ortak kuyruğuna** düşer;
`GET /admin/tasks?myQueue=true` hem üstlenilmemiş birim işlerini hem kişiye
atanmış işleri, **en yeni kayıt en üstte** olacak şekilde döner.

*Üstlen* (`POST /admin/tasks/:id/claim`) tek işlemde:

1. görevi üstlenene atar ve diğerlerinin kuyruğundan düşürür,
2. kaydın sorumlusunu yazar (`applications.assigned_to` veya `audits.auditor_id`),
3. `ASSIGNED` olarak denetim izine geçer.

Görevi başkası üstlenmişse ikinci istek `409` döner. Sorumlu alanı **elle
değiştirilemez**; başvuru detayında aşamanın sahibi birimin üstlenen kişisi
salt okunur gösterilir — satınalma aşamasında satınalmadaki, denetim aşamasında
kalitedeki kişi.

---

## Kalite notlandırma

Kontrol listesi 7 bölüm, 22 maddedir (IATF 16949 esinli). Her madde 0–100 arası puanlanır
ve maddenin ağırlığıyla çarpılır:

```
puan = Σ(ağırlık × madde puanı) / Σ(ağırlık)
```

| Bölüm | Toplam ağırlık |
|---|:--:|
| Kalite Yönetim Sistemi | 7 |
| Üretim Süreç Yeterliliği | 10 |
| Ölçüm ve Test Yetkinliği | 6 |
| Malzeme ve Tedarik Zinciri | 5 |
| Teslimat ve Kapasite | 7 |
| İSG, Çevre ve Sürdürülebilirlik | 5 |
| Finansal ve Kurumsal Sağlamlık | 5 |

Varsayılan not eşikleri (Ayarlar ekranından değiştirilebilir):

| Not | Puan | Sonuç |
|:--:|---|---|
| **A** | ≥ 85 | Onaylı tedarikçi |
| **B** | ≥ 70 | Onaylı tedarikçi |
| **C** | ≥ 55 | Şartlı onay (`CONDITIONAL`) |
| **D** | < 55 | Elenir, iyileştirme sonrası yeniden başvurabilir |

**Not elle değiştirilemez.** Denetimi tamamlama ekranında hesaplanan puan ve
karşılığı olan not gösterilir; not alanı düzenlenebilir değildir ve API'ye
gönderilen not alanları yok sayılır. Değerlendirmenin öznelliği kontrol listesi
puanlamasında kalır — bir maddeye verilen puan tartışılabilir, sonucun puandan
sapması tartışılamaz. Tüm maddeler puanlanmadan denetim tamamlanamaz.

---

## Uygunsuzluk (NCR) akışı

```
OPEN ──► SUPPLIER_RESPONDED ──► UNDER_REVIEW ──┬──► CLOSED
  ▲            (8D cevabı)                     └──► REJECTED ──┐
  └────────────────────────────────────────────────────────────┘
                         (yeni cevap istenir)
```

Tedarikçi cevabını hesapsız, süreli bağlantı üzerinden girer:
acil önlem (D3), kök neden (D4), düzeltici faaliyet (D5–D6), önleyici faaliyet (D7).
Kalite birimi etkinlik doğrulamasını (D8) girerek kaydı kapatır.

**Kural:** Kök neden ve düzeltici faaliyet girilmeden NCR kapatılamaz — API seviyesinde engellenir.
