/** Ortak tipler — hem sunucu hem arayüz kullanır. */

/** Gözlem sıklığı. Dönemler her zaman dönem BAŞLANGICI olarak saklanır (YYYY-MM-DD). */
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

/**
 * Kaynağın veri zincirindeki yeri. Kullanıcı "verinin en doğru kaynağı" istediği için
 * bir aynanın (ör. FRED) asıl üreticiyle (ör. BLS) karıştırılmaması esastır.
 */
export type SourceTier =
  | 'official'   // Veriyi üreten resmî kurum (TÜİK, TCMB, EPDK, EPİAŞ, BOTAŞ, Eurostat, BLS, EIA, ILO, IMF, Dünya Bankası)
  | 'mirror'     // Resmî veriyi API ile yeniden yayımlayan güvenilir ayna (FRED gibi)
  | 'benchmark'  // Piyasanın referans aldığı ticari fiyat değerlendirmesi (Platts, Argus, LME, FBX, Drewry, SCFI)
  | 'manual';    // Kurum içi sözleşme/teklif verisi — elle veya CSV ile girilir

/** Seri kodunun doğrulanma durumu. */
export type CodeConfidence =
  | 'verified'   // Kod uygulama içinden canlı doğrulandı (sources:check başarılı)
  | 'documented' // Kaynak dokümantasyonundan alındı, henüz canlı doğrulanmadı
  | 'verify';    // Kullanıcının kendi ortamında teyit etmesi gereken kod

export type Category =
  | 'inflation' | 'minimum_wage' | 'steel' | 'scrap'
  | 'fuel' | 'freight' | 'energy' | 'fx';

export interface SourceDef {
  id: string;
  /** Kurum/kuruluş adı. */
  org: string;
  /** Türkçe kısa ad. */
  name: string;
  tier: SourceTier;
  /** Kurumun ana sayfası. */
  homepage: string;
  /** Veri/API dokümantasyonu. */
  docsUrl: string;
  /** Kullanım koşulu / lisans özeti. */
  license: string;
  /** Erişim türü. */
  auth: 'none' | 'api_key' | 'login' | 'manual';
  /** API anahtarı için ortam değişkeni adı. */
  envVar?: string;
  /** Anahtarın alındığı sayfa. */
  signupUrl?: string;
  /** Neden bu kaynak seçildi — kaynaklar sayfasında gösterilir. */
  why: string;
}

export interface SeriesDef {
  id: string;
  category: Category;
  nameTr: string;
  nameEn: string;
  /** Ölçü birimi, insan tarafından okunur (ör. "TL/MWh", "USD/ton", "%"). */
  unit: string;
  /** Parasal serilerde ISO 4217 kodu; endeks/yüzde serilerinde null. */
  currency: string | null;
  freq: Frequency;
  /** ISO 3166-1 alpha-2, bölge kodu (EU27, EA) ya da WORLD. */
  geo: string;
  /** Verinin ALINDIĞI kanal (bağlayıcının konuştuğu servis). */
  sourceId: string;
  /**
   * Veriyi ÜRETEN kurum, kanaldan farklıysa. Örneğin ABD çelik ÜFE'sini BLS
   * üretir, FRED yalnızca dağıtır; TÜFE'yi TÜİK üretir, EVDS dağıtır.
   * Boşsa üretici ile kanal aynıdır.
   */
  producerSourceId?: string;
  /** Bağlayıcı kimliği. */
  connector: string;
  /** Bağlayıcıya özel parametreler (seri kodu, veri kümesi, filtreler). */
  params: Record<string, string | number | boolean>;
  /** İnsan bu seriyi kaynağın sitesinde nereden doğrular. */
  verifyUrl: string;
  confidence: CodeConfidence;
  /** Metodoloji/kapsam notu — panoda "i" ipucu olarak gösterilir. */
  note?: string;
  /** Panoda öne çıkan seri mi. */
  featured?: boolean;
  /** Küçükten büyüğe sıralama önceliği. */
  order?: number;
}

export interface Observation {
  period: string; // YYYY-MM-DD (dönem başlangıcı)
  value: number;
}

/** Grafik/tabloda uygulanabilen dönüşümler. */
export type Transform =
  | 'raw'      // ham değer
  | 'yoy'      // yıllık % değişim
  | 'mom'      // önceki döneme göre % değişim
  | 'index'    // seçili aralığın ilk gözlemi = 100
  | 'cumulative'; // aralık başından itibaren birikimli % değişim

export interface SeriesPayload {
  series: SeriesDef;
  observations: Observation[];
  /** Dönüşüm sonrası birim (ör. yoy için "%"). */
  displayUnit: string;
  lastFetchedAt: string | null;
  lastStatus: string | null;
}

export interface FetchRun {
  id: number;
  seriesId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'ok' | 'error' | 'skipped' | 'running';
  rows: number;
  message: string | null;
}

export interface SourceHealth {
  sourceId: string;
  configured: boolean;      // gereken anahtar tanımlı mı
  seriesCount: number;
  okCount: number;
  errorCount: number;
  lastRunAt: string | null;
  lastMessage: string | null;
}
