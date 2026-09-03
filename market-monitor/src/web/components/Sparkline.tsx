/** Kart içi mini eğri. Eksen ve etiket yoktur; yalnızca son dönemin biçimini gösterir. */
export function Sparkline({ points, color = '--series-1' }: { points: { value: number }[]; color?: string }) {
  if (points.length < 2) return <div style={{ height: 26 }} />;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 26;
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 3) - 1.5).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={`var(${color})`} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
