import type { Observation, SeriesDef } from '../../shared/types.js';

export interface FetchContext {
  /** Bu tarihten itibaren veri iste (YYYY-MM-DD). Boşsa tüm geçmiş. */
  since?: string;
  /** Anahtar gerektiren kaynaklar için çözülmüş anahtar. */
  apiKey?: string | null;
}

export interface Connector {
  id: string;
  /** Bu bağlayıcı çalışmak için bir anahtara ihtiyaç duyuyorsa ortam değişkeni adı. */
  requiresEnv?: string;
  /** Anahtar yoksa bile çalışabiliyorsa true (ör. FRED anahtarsız CSV). */
  worksWithoutKey?: boolean;
  fetch(series: SeriesDef, ctx: FetchContext): Promise<Observation[]>;
}

/** Aynı döneme birden çok değer gelirse sonuncuyu tut; dönemi sıralı döndür. */
export function dedupe(obs: Observation[]): Observation[] {
  const map = new Map<string, number>();
  for (const o of obs) {
    if (Number.isFinite(o.value)) map.set(o.period, o.value);
  }
  return [...map.entries()]
    .map(([period, value]) => ({ period, value }))
    .sort((a, b) => a.period.localeCompare(b.period));
}
