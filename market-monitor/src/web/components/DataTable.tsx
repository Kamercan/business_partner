import { formatPeriod, formatValue } from '../lib/format.js';
import type { ResolvedSeries } from '../lib/api.js';

/**
 * Tablo görünümü.
 *
 * Yalnızca bir kolaylık değil, erişilebilirlik gereğidir: açık temada bazı seri
 * renkleri yüzeye karşı 3:1 kontrastın altında kaldığı için değerlerin metin
 * olarak da okunabildiği bir görünüm her zaman bulunur.
 */
export function DataTable({ series, freq }: { series: ResolvedSeries[]; freq?: string }) {
  const periods = [...new Set(series.flatMap((s) => s.observations.map((o) => o.period)))].sort().reverse();
  const maps = series.map((s) => new Map(s.observations.map((o) => [o.period, o.value])));

  if (periods.length === 0) return <div className="empty">Gösterilecek veri yok.</div>;

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Dönem</th>
              {series.map((s) => (
                <th key={s.series.id} className="num">
                  {s.series.nameTr}
                  <div style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{s.displayUnit}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.slice(0, 400).map((p) => (
              <tr key={p}>
                <td>{formatPeriod(p, freq ?? series[0]?.series.freq)}</td>
                {maps.map((m, i) => (
                  <td key={series[i]!.series.id} className="num">
                    {m.has(p) ? formatValue(m.get(p)!, series[i]!.displayUnit) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {periods.length > 400 && (
        <div className="small muted" style={{ padding: '8px 12px' }}>
          İlk 400 dönem gösteriliyor — tamamı için CSV indirin.
        </div>
      )}
    </div>
  );
}
