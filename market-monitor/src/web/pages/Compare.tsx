import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type CompareResponse, type SeriesMeta } from '../lib/api.js';
import { Legend, TimeChart, type ChartSeries } from '../components/Chart.js';
import { DataTable } from '../components/DataTable.js';
import { colorForSeries } from '../lib/format.js';
import type { Transform } from '../../shared/types.js';

const TRANSFORMS: { id: Transform; label: string; hint: string }[] = [
  { id: 'raw', label: 'Ham değer', hint: 'Kaynağın yayımladığı değer' },
  { id: 'yoy', label: 'Yıllık %', hint: 'Bir yıl öncesine göre yüzde değişim' },
  { id: 'index', label: 'Endeks = 100', hint: 'Aralığın ilk dönemi 100 kabul edilir' },
  { id: 'cumulative', label: 'Birikimli %', hint: 'Aralık başından bugüne toplam değişim' },
];

const RANGES: { id: string; label: string; months: number | null }[] = [
  { id: '1y', label: '1 yıl', months: 12 },
  { id: '3y', label: '3 yıl', months: 36 },
  { id: '5y', label: '5 yıl', months: 60 },
  { id: '10y', label: '10 yıl', months: 120 },
  { id: 'all', label: 'Tümü', months: null },
];

const CATEGORY_TITLE: Record<string, string> = {
  inflation: 'Enflasyon', minimum_wage: 'Asgari ücret', steel: 'Sac metal', scrap: 'Hurda demir',
  fuel: 'Akaryakıt', freight: 'Navlun', energy: 'Enerji', fx: 'Kur',
};

export function Compare() {
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState<SeriesMeta[]>([]);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [error, setError] = useState<string | null>(null);
  const [autoIndexed, setAutoIndexed] = useState(false);

  const ids = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);
  const transform = (params.get('transform') as Transform) || 'raw';
  const range = params.get('range') ?? '5y';
  const currency = params.get('currency') ?? '';

  const from = useMemo(() => {
    const months = RANGES.find((r) => r.id === range)?.months;
    if (!months) return undefined;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  }, [range]);

  const update = useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => { api.catalog().then((c) => setCatalog(c.series)).catch(() => setCatalog([])); }, []);

  useEffect(() => {
    if (ids.length === 0) { setData(null); return; }
    setError(null);
    api.compare(ids, { from, transform, currency: currency || undefined })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [ids, from, transform, currency]);

  /**
   * Tek eksen kuralı: birimleri farklı seriler ham değerle aynı grafikte
   * okunmaz. Bu durumda seriler otomatik olarak ortak tabana endekslenir ve
   * neden endekslendiği açıkça yazılır — kullanıcı isterse geri alabilir.
   */
  useEffect(() => {
    if (data?.mixedUnits && transform === 'raw') {
      setAutoIndexed(true);
      update({ transform: 'index' });
    }
  }, [data?.mixedUnits, transform, update]);

  const toggleSeries = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length > 8) return;
    update({ ids: next.join(',') });
  };

  const chartSeries: ChartSeries[] = (data?.series ?? []).map((s) => ({
    id: s.series.id,
    label: s.series.nameTr,
    color: colorForSeries(s.series.id, ids).replace(/^var\(|\)$/g, ''),
    points: s.observations,
    hidden: hidden.includes(s.series.id),
  }));

  const unit = data?.series[0]?.displayUnit ?? '';
  const grouped = groupByCategory(catalog);
  const monetarySelected = (data?.series ?? []).some((s) => s.series.currency);

  return (
    <>
      <div className="page-head">
        <h1>Karşılaştırma</h1>
        <p>
          En fazla 8 gösterge seçin. Birimleri farklı seriler tek eksende ham değerle karşılaştırılamayacağı için
          otomatik olarak ortak bir tabana endekslenir; para birimi seçerseniz çevrim TCMB gösterge kuruyla yapılır.
        </p>
      </div>

      <div className="controls">
        <div className="field">
          <label htmlFor="range">Dönem</label>
          <div className="segmented" id="range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => update({ range: r.id })}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="transform">Gösterim</label>
          <div className="segmented" id="transform">
            {TRANSFORMS.map((t) => (
              <button
                key={t.id} type="button" title={t.hint}
                aria-pressed={transform === t.id}
                onClick={() => { setAutoIndexed(false); update({ transform: t.id === 'raw' ? '' : t.id }); }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {monetarySelected && (
          <div className="field">
            <label htmlFor="currency">Para birimi</label>
            <select id="currency" value={currency} onChange={(e) => update({ currency: e.target.value })}>
              <option value="">Kaynağın kendi birimi</option>
              <option value="TRY">TL'ye çevir</option>
              <option value="USD">Dolara çevir</option>
              <option value="EUR">Euroya çevir</option>
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="view">Görünüm</label>
          <div className="segmented" id="view">
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Grafik</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Tablo</button>
          </div>
        </div>
        <div className="spacer" />
        {ids.length > 0 && (
          <a className="btn" href={api.exportCompareUrl(ids, { from, transform, currency: currency || undefined })}>
            CSV indir
          </a>
        )}
      </div>

      {autoIndexed && (
        <div className="notice">
          <span className="notice-icon">ℹ</span>
          <div className="notice-body">
            <strong>Seriler ortak tabana endekslendi</strong>
            <p>
              Seçtiğiniz göstergelerin birimleri farklı ({data?.units.join(' · ')}). İki farklı ölçeği tek grafikte
              ham değerle göstermek yanıltıcı olacağı için aralığın ilk dönemi 100 kabul edildi.
              Ham değerleri görmek için tek birimli seriler seçin ya da <em>Ham değer</em>'e dönün.
            </p>
          </div>
        </div>
      )}

      {data?.series.some((s) => s.currencyWarning) && (
        <div className="notice warn">
          <span className="notice-icon">⚠</span>
          <div className="notice-body">
            <strong>Para birimi çevrimi eksik</strong>
            <p>{data.series.find((s) => s.currencyWarning)?.currencyWarning}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="notice err"><span className="notice-icon">✗</span>
          <div className="notice-body"><strong>Hata</strong><p>{error}</p></div></div>
      )}

      {ids.length === 0 ? (
        <div className="card empty">Aşağıdan en az bir gösterge seçin.</div>
      ) : !data ? (
        <div className="card empty">Yükleniyor…</div>
      ) : view === 'chart' ? (
        <div className="chart-card">
          <TimeChart series={chartSeries} unit={unit} freq={data.series[0]?.series.freq} />
          <Legend
            series={chartSeries}
            onToggle={(id) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))}
          />
        </div>
      ) : (
        <DataTable series={data.series} />
      )}

      <section className="section" style={{ marginTop: 22 }}>
        <div className="section-head">
          <h2>Göstergeler</h2>
          <p>{ids.length}/8 seçili</p>
        </div>
        <div className="picker">
          {grouped.map(([category, metas]) => (
            <div className="picker-group" key={category}>
              <h3>{CATEGORY_TITLE[category] ?? category}</h3>
              {metas.map((m) => {
                const checked = ids.includes(m.series.id);
                const blocked = !checked && ids.length >= 8;
                const noData = m.count === 0;
                return (
                  <label
                    key={m.series.id}
                    className={`picker-item${blocked || noData ? ' disabled' : ''}`}
                    title={noData ? 'Bu seride henüz veri yok — Kaynaklar sayfasına bakın' : m.series.note ?? ''}
                  >
                    <input
                      type="checkbox" checked={checked} disabled={blocked || noData}
                      onChange={() => toggleSeries(m.series.id)}
                    />
                    <span>
                      {checked && (
                        <span
                          className="legend-key"
                          style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle', background: colorForSeries(m.series.id, ids) }}
                        />
                      )}
                      {m.series.nameTr}
                      {noData && <span className="muted small"> · veri yok</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function groupByCategory(metas: SeriesMeta[]): [string, SeriesMeta[]][] {
  const order = ['inflation', 'minimum_wage', 'steel', 'scrap', 'fuel', 'freight', 'energy', 'fx'];
  const map = new Map<string, SeriesMeta[]>();
  for (const m of metas) {
    const list = map.get(m.series.category) ?? [];
    list.push(m);
    map.set(m.series.category, list);
  }
  return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!]);
}
