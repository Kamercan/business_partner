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

| İşlem | ADMIN | MODERATOR | QUALITY | VIEWER |
|---|:--:|:--:|:--:|:--:|
| Başvuru listeleme / detay / Excel | ✓ | ✓ | ✓ | ✓ |
| Başvuru durumu değiştirme | ✓ | ✓ | ✓ | — |
| Onay / eleme kararı | ✓ | ✓¹ | ✓ | — |
| Toplu işlem | ✓ | ✓ | — | — |
| Bilgi/belge talebi | ✓ | ✓ | ✓ | — |
| Denetim planlama ve puanlama | ✓ | — | ✓ | — |
| Denetimi tamamlama, not verme | ✓ | — | ✓ | — |
| Tedarikçi güncelleme | ✓ | ✓ | ✓ | — |
| Sözleşme oluşturma | ✓ | ✓ | — | — |
| NCR açma / kapatma | ✓ | ✓ | ✓ | — |
| Belge yükleme / paylaşma | ✓ | ✓ | ✓ | — |
| Belge silme | ✓ | — | — | — |
| Kullanıcı ve taksonomi yönetimi | ✓ | — | — | — |
| Başvuru kalıcı silme (KVKK) | ✓ | — | — | — |

¹ Moderatör onay/eleme kararını ancak **tamamlanmış bir kalite denetimi varsa** verebilir.
Denetimsiz onay sistem tarafından engellenir.

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
