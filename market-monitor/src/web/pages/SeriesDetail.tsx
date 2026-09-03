import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type ResolvedSeries } from '../lib/api.js';
import { Legend, TimeChart } from '../components/Chart.js';
import { DataTable } from '../components/DataTable.js';
import { ConfidenceBadge } from '../components/Badges.js';
import { formatPct, formatPeriod, formatValue } from '../lib/format.js';
import type { Transform } from '../../shared/types.js';

const TRANSFORMS: { id: Transform; label: string }[] = [
  { id: 'raw', label: 'Ham değer' },
  { id: 'yoy', label: 'Yıllık %' },
  { id: 'mom', label: 'Dönemlik %' },
  { id: 'index', label: 'Endeks = 100' },
];

export function SeriesDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ResolvedSeries | null>(null);
  const [refs, setRefs] = useState<Record<string, { source: string; note?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const transform = (params.get('transform') as Transform) || 'raw';
  const currency = params.get('currency') ?? '';

  useEffect(() => {
    setError(null);
    api.series(id, { transform, currency: currency || undefined }).then(setData).catch((e: Error) => setError(e.message));
    api.references(id).then((r) => setRefs(r.references)).catch(() => setRefs({}));
  }, [id, transform, currency]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  if (error) {
    return <div className="notice err"><span className="notice-icon">✗</span>
      <div className="notice-body"><strong>Seri açılamadı</strong><p>{error}</p></div></div>;
  }
  if (!data) return <div className="empty">Yükleniyor…</div>;

  const s = data.series;
  const refEntries = Object.entries(refs).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <>
      <div className="page-head">
        <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Link to="/" className="small">← Pano</Link>
          <ConfidenceBadge confidence={data.confidence} />
          {data.stale && <span className="badge warn">⏳ Kaynakta daha yeni dönem olabilir</span>}
        </div>
        <h1>{s.nameTr}</h1>
        <p>
          {s.note ?? s.nameEn}
        </p>
      </div>

      <div className="controls">
        <div className="field">
          <label>Gösterim</label>
          <div className="segmented">
            {TRANSFORMS.map((t) => (
              <button key={t.id} type="button" aria-pressed={transform === t.id}
                onClick={() => update({ transform: t.id === 'raw' ? '' : t.id })}>{t.label}</button>
            ))}
          </div>
        </div>
        {s.currency && (
          <div className="field">
            <label htmlFor="cur">Para birimi</label>
            <select id="cur" value={currency} onChange={(e) => update({ currency: e.target.value })}>
              <option value="">{s.currency} (kaynağın birimi)</option>
              {['TRY', 'USD', 'EUR'].filter((c) => c !== s.currency).map((c) => (
                <option key={c} value={c}>{c}'ye çevir</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Görünüm</label>
          <div className="segmented">
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Grafik</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Tablo</button>
          </div>
        </div>
        <div className="spacer" />
        <a className="btn" href={api.exportUrl(id, { transform, currency: currency || undefined })}>CSV indir</a>
      </div>

      {data.currencyWarning && (
        <div className="notice warn"><span className="notice-icon">⚠</span>
          <div className="notice-body"><strong>Çevrim yapılamadı</strong><p>{data.currencyWarning}</p></div></div>
      )}

      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <SummaryStat label="Son değer" value={formatValue(data.summary.last?.value ?? null, data.displayUnit)}
          unit={data.displayUnit}
          sub={data.summary.last ? formatPeriod(data.summary.last.period, s.freq) : '—'} />
        <SummaryStat label="Yıllık değişim" value={formatPct(data.summary.yoyPct)} unit=""
          sub="bir yıl öncesine göre" />
        <SummaryStat label="Önceki döneme göre" value={formatPct(data.summary.changePct)} unit=""
          sub={data.summary.prev ? formatPeriod(data.summary.prev.period, s.freq) : '—'} />
        <SummaryStat label="Kapsam" value={String(data.observations.length)} unit="gözlem"
          sub={data.observations[0] ? `${formatPeriod(data.observations[0].period, s.freq)} →` : '—'} />
      </div>

      {view === 'chart' ? (
        <div className="chart-card">
          <TimeChart
            series={[{ id: s.id, label: s.nameTr, color: '--series-1', points: data.observations }]}
            unit={data.displayUnit}
            freq={s.freq}
          />
          <Legend series={[]} onToggle={() => {}} />
        </div>
      ) : (
        <DataTable series={[data]} />
      )}

      <section className="section" style={{ marginTop: 22 }}>
        <div className="section-head"><h2>Kaynak</h2></div>
        <div className="card">
          <dl className="kv">
            <dt>Üreten kurum</dt><dd>{data.producerOrg ?? data.sourceOrg}</dd>
            {data.producerOrg && (
              <>
                <dt>Erişim kanalı</dt>
                <dd>
                  {data.sourceOrg}
                  <span className="muted small"> · veriyi üretmez, yeniden yayımlar</span>
                </dd>
              </>
            )}
            <dt>Birim</dt><dd>{s.unit}{s.currency ? ` · ${s.currency}` : ''}</dd>
            <dt>Sıklık</dt><dd>{freqLabel(s.freq)}</dd>
            <dt>Kapsam</dt><dd>{s.geo}</dd>
            <dt>Bağlayıcı</dt><dd className="mono">{s.connector}{Object.keys(s.params).length ? ` · ${JSON.stringify(s.params)}` : ''}</dd>
            <dt>Doğrulama</dt><dd><a href={data.verifyUrl} target="_blank" rel="noreferrer noopener">{data.verifyUrl}</a></dd>
          </dl>
          {s.note && <p className="small muted" style={{ margin: 0 }}>{s.note}</p>}
        </div>
      </section>

      {refEntries.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Dönem bazlı belge referansları</h2>
            <p>Her değerin hangi resmî karara/bültene dayandığı</p>
          </div>
          <div className="table-wrap">
            <div className="table-scroll">
              <table>
                <thead><tr><th>Dönem</th><th>Kaynak belge</th><th>Not</th></tr></thead>
                <tbody>
                  {refEntries.map(([period, r]) => (
                    <tr key={period}>
                      <td>{formatPeriod(period, s.freq)}</td>
                      <td style={{ whiteSpace: 'normal' }}>{linkify(r.source)}</td>
                      <td style={{ whiteSpace: 'normal' }} className="muted">{r.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function SummaryStat({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <div className="card" style={{ flex: '1 1 190px', minWidth: 170 }}>
      <div className="small muted">{label}</div>
      <div style={{ margin: '3px 0 1px' }}>
        <span className="tile-value">{value}</span>
        {unit && <span className="tile-unit">{unit}</span>}
      </div>
      <div className="small muted">{sub}</div>
    </div>
  );
}

function freqLabel(freq: string): string {
  const map: Record<string, string> = {
    daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık',
    quarterly: 'Çeyreklik', semiannual: 'Altı aylık', annual: 'Yıllık',
  };
  return map[freq] ?? freq;
}

/** Referans metnindeki adresi tıklanabilir yapar; metin verisi olarak işlenir. */
function linkify(text: string) {
  const m = /(https?:\/\/\S+)/.exec(text);
  if (!m?.[1]) return text;
  const before = text.slice(0, m.index);
  return (
    <>
      {before}
      <a href={m[1]} target="_blank" rel="noreferrer noopener">{m[1]}</a>
    </>
  );
}
