import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Lang } from '../i18n';

export type MetaData = {
  categories: Array<{
    code: string;
    name_tr: string; name_en: string; name_ja: string | null;
    hint_tr: string | null; hint_en: string | null; hint_ja: string | null;
  }>;
  certifications: Array<{ code: string; name: string }>;
  sectors: Array<{ code: string; name_tr: string; name_en: string; name_ja: string | null }>;
  countries: Array<{ code: string; tr: string; en: string; ja: string }>;
  employeeBands: string[];
  revenueBands: string[];
  statuses: string[];
  org: { name: string; short: string };
  sla: { reviewDays: number; auditDays: number; ncrResponseDays: number };
};

let cache: MetaData | null = null;
let inflight: Promise<MetaData> | null = null;

/** Referans verileri bir kez indirir ve tüm ekranlarda paylaşır. */
export function useMeta(): MetaData | null {
  const [meta, setMeta] = useState<MetaData | null>(cache);

  useEffect(() => {
    if (cache) return;
    inflight ??= api.get<MetaData>('/meta');
    let cancelled = false;
    inflight
      .then((data) => {
        cache = data;
        if (!cancelled) setMeta(data);
      })
      .catch(() => {
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return meta;
}

/**
 * Kod → görünen ad sözlüğü (ürün grupları için).
 * Japonca karşılık girilmemişse İngilizceye, o da yoksa Türkçeye düşer.
 */
export function categoryNames(meta: MetaData | null, lang: Lang = 'tr'): Record<string, string> {
  if (!meta) return {};
  return Object.fromEntries(
    meta.categories.map((c) => [c.code, (lang === 'ja' ? c.name_ja : lang === 'en' ? c.name_en : c.name_tr) || c.name_en || c.name_tr]),
  );
}
