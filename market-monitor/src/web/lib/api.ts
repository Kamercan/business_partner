import type { Observation, SeriesDef, SourceDef, Transform } from '../../shared/types.js';

export interface SeriesMeta {
  series: SeriesDef;
  sourceOrg: string; sourceName: string; sourceTier: string;
  producerOrg: string | null;
  count: number; firstPeriod: string | null; lastPeriod: string | null; lastValue: number | null;
  stale: boolean;
  lastRunStatus: string | null; lastRunAt: string | null; lastRunMessage: string | null;
  keyMissing: boolean; keyEnvVar: string | null;
}

export interface Summary {
  last: Observation | null; prev: Observation | null;
  changePct: number | null; yoyPct: number | null;
}

export interface ResolvedSeries {
  series: SeriesDef;
  observations: Observation[];
  displayUnit: string;
  currency: string | null;
  currencyWarning?: string;
  summary: Summary;
  sourceOrg: string;
  producerOrg: string | null;
  verifyUrl: string;
  confidence: string;
  stale: boolean;
}

export interface CompareResponse {
  series: ResolvedSeries[];
  missing: string[];
  mixedUnits: boolean;
  units: string[];
}

export interface DashboardCard {
  meta: SeriesMeta;
  summary: Summary | null;
  unit: string;
  spark: Observation[];
}

export interface SourceHealthEntry {
  source: SourceDef;
  seriesCount: number; okCount: number; errorCount: number; skippedCount: number;
  staleCount: number; keyMissing: boolean;
  series: SeriesMeta[];
  /** Bu kurumun ürettiği ama başka bir kanaldan alınan göstergeler. */
  producedElsewhere: SeriesMeta[];
}

export interface StatusResponse {
  lastIngestAt: string | null; refreshing: boolean; refreshMinutes: number;
  total: number; withData: number; stale: number; failing: number;
  needsKey: number; manualPending: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `İstek başarısız (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string; errors?: string[] }) | null;
  if (!res.ok) throw new Error(data?.error ?? `İstek başarısız (HTTP ${res.status})`);
  return data as T;
}

/** Tür takma adı kullanılır: TypeScript yalnızca bunlara örtük indeks imzası verir. */
export type RangeQuery = {
  from?: string; to?: string; transform?: Transform; currency?: string;
};

function qs(q: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const api = {
  status: () => get<StatusResponse>('/status'),
  catalog: () => get<{ categories: { id: string; title: string; blurb: string }[]; series: SeriesMeta[] }>('/catalog'),
  dashboard: (q: RangeQuery = {}) => get<{ cards: DashboardCard[] }>(`/dashboard${qs(q)}`),
  series: (id: string, q: RangeQuery = {}) => get<ResolvedSeries>(`/series/${encodeURIComponent(id)}${qs(q)}`),
  references: (id: string) =>
    get<{ references: Record<string, { source: string; note?: string }> }>(`/series/${encodeURIComponent(id)}/references`),
  compare: (ids: string[], q: RangeQuery = {}) =>
    get<CompareResponse>(`/compare${qs({ ...q, ids: ids.join(',') })}`),
  sources: () => get<{ sources: SourceDef[]; health: SourceHealthEntry[] }>('/sources'),
  refresh: (only?: string) => post<{ started?: boolean; results?: unknown[] }>('/admin/refresh', { only }),
  manualEntry: (body: { seriesId: string; period: string; value: string; sourceRef: string; note?: string }) =>
    post<{ ok: true; period: string; value: number }>('/admin/manual', body),
  importCsv: (body: { seriesId: string; csv: string; sourceRef?: string }) =>
    post<{ ok: true; imported: number; skipped: number; errors: string[] }>('/admin/import', body),
  exportUrl: (id: string, q: RangeQuery = {}) => `/api/export/${encodeURIComponent(id)}.csv${qs(q)}`,
  exportCompareUrl: (ids: string[], q: RangeQuery = {}) => `/api/export/compare.csv${qs({ ...q, ids: ids.join(',') })}`,
};
