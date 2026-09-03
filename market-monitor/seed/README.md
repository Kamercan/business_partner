# Tohum veri dosyaları

Bu dizindeki CSV'ler, **kamu API'si bulunmayan ama resmî bir belgede tek tek
ilan edilen** seriler içindir. Türkiye asgari ücreti bunun tipik örneğidir:
istatistik değil, Asgari Ücret Tespit Komisyonu kararıdır ve Resmî Gazete'de
yayımlanır.

## Biçim

```csv
donem,deger,kaynak,not
2024-01-01,20002.50,"Asgari Ücret Tespit Komisyonu Kararı — https://...","1 Ocak 2024'ten geçerli"
```

| Sütun | Açıklama |
|---|---|
| `donem` | Dönem başlangıcı, `YYYY-MM-DD` |
| `deger` | Sayısal değer, ondalık ayracı **nokta** |
| `kaynak` | Değerin alındığı resmî belge/sayfa — Kaynaklar sayfasında gösterilir |
| `not` | Serbest açıklama (yürürlük tarihi, kapsam) |

## Doğrulama sorumluluğu

> Bu dosyalardaki değerler uygulamayla birlikte gelen **başlangıç** verisidir.
> Üretimde kullanmadan önce her satırı `kaynak` sütunundaki resmî sayfadan
> teyit edin. Pano, kaynağı doğrulanmamış hiçbir seriyi "doğrulanmış" olarak
> göstermez.

## Eksik dönem eklemek

Yeni bir asgari ücret kararı çıktığında dosyanın sonuna satır ekleyip
`npm run ingest -- --only tr.minwage.gross` çalıştırmak yeterlidir. Aynı işi
arayüzdeki **Veri Girişi** sayfasından da yapabilirsiniz.
