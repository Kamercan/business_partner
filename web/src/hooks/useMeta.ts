import { useEffect, useState } from 'react';
import { api } from '../api/client';

export type MetaData = {
  categories: Array<{ code: string; name_tr: string; name_en: string; hint_tr: string | null; hint_en: string | null }>;
  certifications: Array<{ code: string; name: string }>;
  sectors: Array<{ code: string; name_tr: string; name_en: string }>;
  countries: Array<{ code: string; tr: string; en: string }>;
  employeeBands: string[];
  revenueBands: string[];
  statuses: string[];
  sources: string[];
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

/** Kod → görünen ad sözlüğü (ürün grupları için). */
export function categoryNames(meta: MetaData | null, lang: 'tr' | 'en' = 'tr'): Record<string, string> {
  if (!meta) return {};
  return Object.fromEntries(meta.categories.map((c) => [c.code, lang === 'tr' ? c.name_tr : c.name_en]));
}
