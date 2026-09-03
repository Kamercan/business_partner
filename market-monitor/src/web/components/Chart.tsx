import { useEffect, useRef, useState } from 'react';
import {
  Chart, LineController, LineElement, PointElement, LinearScale, Filler, Tooltip,
  type ChartConfiguration, type Plugin,
} from 'chart.js';
import { cssVar, formatAxisTick, formatPeriod, formatValue, stripSharedPrefix } from '../lib/format.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);

export interface ChartSeries {
  id: string;
  label: string;
  color: string;           // CSS değişkeni adı, ör. "--series-1"
  points: { period: string; value: number }[];
  hidden?: boolean;
}

interface TipState {
  x: number; y: number; period: string;
  rows: { label: string; color: string; value: number }[];
}

/**
 * Zaman serisi grafiği.
 *
 * Tasarım kararları:
 *  • X ekseni gerçek zaman (milisaniye) üzerinden doğrusaldır — böylece yıllık
 *    ve günlük seriler aynı grafikte doğru aralıklarla oturur.
 *  • Tüm seriler ortak bir dönem kümesine hizalanır, eksik noktalar null'dır;
 *    bu sayede tek imleç konumunda BÜTÜN serilerin değeri okunabilir.
 *  • Tek bir Y ekseni vardır. Farklı birimler asla iki eksene bölünmez;
 *    bunun yerine çağıran taraf serileri ortak tabana endeksler.
 */
export function TimeChart({ series, unit, freq }: { series: ChartSeries[]; unit: string; freq?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const themeSignal = useThemeSignal();
  const visible = series.filter((s) => !s.hidden);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ink = cssVar('--text-secondary');
    const inkStrong = cssVar('--text-primary');
    const grid = cssVar('--grid');
    const surface = cssVar('--surface-1');

    // Ortak zaman ekseni: bütün serilerin dönemlerinin birleşimi.
    const allPeriods = [...new Set(visible.flatMap((s) => s.points.map((p) => p.period)))].sort();
    const xs = allPeriods.map((p) => Date.parse(p));

    const datasets = visible.map((s) => {
      const byPeriod = new Map(s.points.map((p) => [p.period, p.value]));
      const color = cssVar(s.color);
      return {
        label: s.label,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: surface,
        pointHitRadius: 14,           // isabet alanı işaretten büyük
        tension: 0.16,
        spanGaps: true,
        data: allPeriods.map((p, i) => ({ x: xs[i]!, y: byPeriod.get(p) ?? null })),
      };
    });

    /** İmleç: etkin noktanın X'inde dikey ince çizgi. */
    const crosshair: Plugin = {
      id: 'crosshair',
      afterDatasetsDraw(chart) {
        const active = chart.getActiveElements();
        if (active.length === 0) return;
        const x = active[0]!.element.x;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = cssVar('--border-strong');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.restore();
      },
    };

    /**
     * Uç etiketleri: 4 veya daha az seride kimlik doğrudan çizgi ucunda okunur.
     * Metin mürekkep renginde, kimliği yanındaki kısa renkli çizgi taşır.
     */
    const endLabels: Plugin = {
      id: 'endLabels',
      afterDatasetsDraw(chart) {
        if (datasets.length > 4 || datasets.length < 1) return;
        const shortLabels = stripSharedPrefix(visible.map((s) => s.label));
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const used: number[] = [];
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          const raw = ds.data as ({ x: number; y: number | null } | null)[];
          let lastIdx = -1;
          for (let i = raw.length - 1; i >= 0; i -= 1) {
            if (raw[i]?.y !== null && raw[i]?.y !== undefined) { lastIdx = i; break; }
          }
          const last = lastIdx >= 0 ? meta.data[lastIdx] : undefined;
          if (!last) return;
          let y = last.y;
          while (used.some((u) => Math.abs(u - y) < 13)) y += 13;   // çakışmayı aç
          used.push(y);
          const x = Math.min(last.x + 7, chart.chartArea.right - 4);
          ctx.strokeStyle = cssVar(visible[di]!.color);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 9, y);
          ctx.stroke();
          ctx.fillStyle = inkStrong;
          const text = shortLabels[di] ?? visible[di]!.label;
          const short = text.length > 24 ? `${text.slice(0, 23)}…` : text;
          ctx.fillText(short, x + 13, y);
        });
        ctx.restore();
      },
    };

    const cfg: ChartConfiguration<'line'> = {
      type: 'line',
      data: { datasets: datasets as never },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        layout: { padding: { right: datasets.length <= 4 ? 158 : 12, top: 6 } },
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        scales: {
          x: {
            type: 'linear',
            border: { display: false },
            grid: { display: false },
            ticks: {
              color: ink, maxRotation: 0, autoSkipPadding: 26, font: { size: 11 },
              callback: (v) => formatAxisTick(Number(v), freq),
            },
          },
          y: {
            border: { display: false },
            grid: { color: grid, drawTicks: false },
            ticks: { color: ink, font: { size: 11 }, padding: 8, callback: (v) => formatValue(Number(v), unit) },
            title: { display: Boolean(unit), text: unit, color: ink, font: { size: 11, weight: 500 } },
          },
        },
        plugins: {
          tooltip: {
            enabled: false,
            external: ({ chart, tooltip }) => {
              if (tooltip.opacity === 0) { setTip(null); return; }
              const first = tooltip.dataPoints[0];
              if (!first) return;
              const period = new Date(Number(first.parsed.x)).toISOString().slice(0, 10);
              setTip({
                x: tooltip.caretX,
                y: tooltip.caretY,
                period,
                rows: tooltip.dataPoints.flatMap((p) => {
                  const y = p.parsed.y as number | null;
                  if (y === null) return [];
                  return [{
                    label: visible[p.datasetIndex]?.label ?? '',
                    color: visible[p.datasetIndex]?.color ?? '--series-1',
                    value: y,
                  }];
                }),
              });
              void chart;
            },
          },
        },
      },
      plugins: [crosshair, endLabels],
    };

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, cfg);
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // Tema değişiminde renkler yeniden okunsun diye tema sinyali de bağımlılıkta.
  }, [series, unit, freq, visible.length, themeSignal]);

  const box = canvasRef.current?.parentElement;
  const flip = tip && box ? tip.x > box.clientWidth - 220 : false;

  return (
    <div className="chart-box">
      <canvas ref={canvasRef} role="img" aria-label={`Zaman serisi grafiği: ${visible.map((s) => s.label).join(', ')}`} />
      {tip && (
        <div
          className="tip"
          style={{ left: flip ? tip.x - 206 : tip.x + 14, top: Math.max(4, tip.y - 30) }}
        >
          <div className="tip-date">{formatPeriod(tip.period, freq)}</div>
          {tip.rows.map((r) => (
            <div className="tip-row" key={r.label}>
              <span className="tip-key" style={{ background: `var(${r.color})` }} />
              <span className="tip-val">{formatValue(r.value, unit)}</span>
              <span className="tip-name">{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tema değiştiğinde grafiğin renkleri yeniden okuması için basit bir sinyal. */
function useThemeSignal(): string {
  const [sig, setSig] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'system');
  useEffect(() => {
    const obs = new MutationObserver(() => setSig(document.documentElement.getAttribute('data-theme') ?? 'system'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSig((s) => `${s}!`);
    mq.addEventListener('change', onChange);
    return () => { obs.disconnect(); mq.removeEventListener('change', onChange); };
  }, []);
  return sig;
}

/** Efsane — iki ve üzeri seride her zaman görünür, tıklayınca seriyi gizler. */
export function Legend({ series, onToggle }: { series: ChartSeries[]; onToggle: (id: string) => void }) {
  if (series.length < 2) return null;
  return (
    <div className="legend">
      {series.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`legend-item${s.hidden ? ' off' : ''}`}
          aria-pressed={!s.hidden}
          onClick={() => onToggle(s.id)}
          title={s.hidden ? 'Göster' : 'Gizle'}
        >
          <span className="legend-key" style={{ background: `var(${s.color})` }} />
          <span>{s.label}</span>
          {s.points.length > 0 && (
            <span className="legend-value">{formatValue(s.points.at(-1)!.value)}</span>
          )}
        </button>
      ))}
    </div>
  );
}
