import { useEffect, useMemo, useState } from 'react';
import { api, type SeriesMeta } from '../lib/api.js';
import { formatPeriod, formatValue } from '../lib/format.js';

/**
 * Elle yönetilen serilerin veri girişi.
 *
 * Bu sayfa, açık API'si olmayan ama işin içinde gerçekten kullanılan fiyatlar
 * içindir: Platts hurda değerlendirmesi, SteelOrbis sac fiyatları, EPDK
 * akaryakıt bültenleri, BOTAŞ gaz tarifeleri, FBX/Drewry navlun endeksleri.
 * Kaynak referansı zorunludur — izi olmayan sayı kabul edilmez.
 */
export function DataEntry() {
  const [catalog, setCatalog] = useState<SeriesMeta[]>([]);
  const [seriesId, setSeriesId] = useState('');
  const [mode, setMode] = useState<'single' | 'csv'>('single');
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string; detail?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [note, setNote] = useState('');
  const [csv, setCsv] = useState('');

  // 'seed' serileri de düzenlenebilir: tohum dosyası başlangıç verisini taşır,
  // yeni resmî kararlar (ör. bir sonraki asgari ücret) buradan eklenir.
  const manualSeries = useMemo(
    () => catalog.filter((m) => m.series.connector === 'manual' || m.series.connector === 'seed'),
    [catalog],
  );
  const selected = manualSeries.find((m) => m.series.id === seriesId) ?? null;

  const reload = () => api.catalog().then((c) => setCatalog(c.series)).catch(() => setCatalog([]));
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (!seriesId && manualSeries[0]) setSeriesId(manualSeries[0].series.id);
  }, [manualSeries, seriesId]);

  const submitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const r = await api.manualEntry({ seriesId, period, value, sourceRef, note: note || undefined });
      setMessage({ kind: 'ok', text: `${formatPeriod(r.period)} → ${formatValue(r.value)} kaydedildi.` });
      setValue(''); setNote('');
      await reload();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Kaydedilemedi' });
    } finally { setBusy(false); }
  };

  const submitCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const r = await api.importCsv({ seriesId, csv, sourceRef: sourceRef || undefined });
      setMessage({
        kind: 'ok',
        text: `${r.imported} satır içe aktarıldı${r.skipped ? `, ${r.skipped} satır atlandı` : ''}.`,
        detail: r.errors,
      });
      if (r.skipped === 0) setCsv('');
      await reload();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'İçe aktarılamadı' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <h1>Veri girişi</h1>
        <p>
          Açık API'si olmayan göstergeler burada güncellenir — abonelikli piyasa değerlendirmeleri
          (hurda CFR Türkiye, HRC/CRC, navlun endeksleri), PDF olarak yayımlanan resmî bültenler
          (EPDK akaryakıt, BOTAŞ doğal gaz) ve resmî kararla belirlenen değerler (asgari ücret).
          <strong> Kaynak referansı zorunludur:</strong> girilen her değer, hangi bültenden/karardan
          geldiğiyle birlikte saklanır ve seri sayfasında gösterilir.
        </p>
      </div>

      <div className="controls">
        <div className="field" style={{ flex: '1 1 420px' }}>
          <label htmlFor="series">Gösterge</label>
          <select id="series" value={seriesId} onChange={(e) => { setSeriesId(e.target.value); setMessage(null); }}>
            {manualSeries.map((m) => (
              <option key={m.series.id} value={m.series.id}>
                {m.series.nameTr} — {m.series.unit} ({m.count} gözlem)
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Yöntem</label>
          <div className="segmented">
            <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>Tek değer</button>
            <button type="button" aria-pressed={mode === 'csv'} onClick={() => setMode('csv')}>CSV yükle</button>
          </div>
        </div>
      </div>

      {selected?.series.note && (
        <div className="notice">
          <span className="notice-icon">ℹ</span>
          <div className="notice-body">
            <strong>{selected.series.nameTr}</strong>
            <p>{selected.series.note}</p>
            <p style={{ marginTop: 5 }}>
              Kaynakta doğrula: <a href={selected.series.verifyUrl} target="_blank" rel="noreferrer noopener">
                {selected.series.verifyUrl}
              </a>
            </p>
          </div>
        </div>
      )}

      {message && (
        <div className={`notice ${message.kind === 'ok' ? '' : 'err'}`}>
          <span className="notice-icon">{message.kind === 'ok' ? '✓' : '✗'}</span>
          <div className="notice-body">
            <strong>{message.text}</strong>
            {message.detail && message.detail.length > 0 && (
              <ul className="small muted" style={{ margin: '5px 0 0', paddingLeft: 18 }}>
                {message.detail.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {mode === 'single' ? (
        <form className="card stack" onSubmit={submitSingle}>
          <div className="row">
            <div className="field">
              <label htmlFor="period">Dönem</label>
              <input id="period" type="date" value={period} required onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '0 1 180px' }}>
              <label htmlFor="value">Değer {selected && `(${selected.series.unit})`}</label>
              <input id="value" inputMode="decimal" required placeholder="örn. 385,50"
                value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 340px' }}>
              <label htmlFor="ref">Kaynak referansı (zorunlu)</label>
              <input id="ref" required placeholder="örn. LME uzlaşma fiyatı 12.03.2026 / EPDK bülten no…"
                value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="note">Not (isteğe bağlı)</label>
            <input id="note" placeholder="kapsam, teslim şekli, kalite…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <button className="btn primary" disabled={busy || !seriesId}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </form>
      ) : (
        <form className="card stack" onSubmit={submitCsv}>
          <div className="field">
            <label htmlFor="csv">CSV içeriği</label>
            <textarea
              id="csv" className="csv" value={csv} required onChange={(e) => setCsv(e.target.value)}
              placeholder={'donem,deger,kaynak\n2026-01-05,382.50,"Platts HMS 80:20 CFR Türkiye — 05.01.2026"\n2026-01-12,388.00,"Platts HMS 80:20 CFR Türkiye — 12.01.2026"'}
            />
            <div className="small muted" style={{ marginTop: 5 }}>
              Zorunlu sütunlar: <code className="mono">donem</code>, <code className="mono">deger</code>.
              İsteğe bağlı: <code className="mono">kaynak</code>, <code className="mono">not</code>.
              Ondalık ayracı olarak nokta da virgül de kabul edilir. <code className="mono">kaynak</code> sütunu
              yoksa aşağıdaki alan bütün satırlara uygulanır.
            </div>
          </div>
          <div className="field">
            <label htmlFor="csvref">Ortak kaynak referansı</label>
            <input id="csvref" placeholder="örn. SteelOrbis haftalık bülten arşivi 2026"
              value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
          </div>
          <div>
            <button className="btn primary" disabled={busy || !seriesId}>{busy ? 'İçe aktarılıyor…' : 'İçe aktar'}</button>
          </div>
        </form>
      )}

      <section className="section" style={{ marginTop: 22 }}>
        <div className="section-head">
          <h2>Elle yönetilen göstergeler</h2>
          <p>{manualSeries.length} seri</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Gösterge</th><th>Birim</th><th className="num">Gözlem</th><th>Son dönem</th><th className="num">Son değer</th></tr>
            </thead>
            <tbody>
              {manualSeries.map((m) => (
                <tr key={m.series.id} onClick={() => setSeriesId(m.series.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ whiteSpace: 'normal', maxWidth: 340 }}>
                    {m.series.nameTr}
                    {m.series.connector === 'seed' && (
                      <span className="muted small"> · tohum veri + eklemeler</span>
                    )}
                  </td>
                  <td className="muted">{m.series.unit}</td>
                  <td className="num">{m.count}</td>
                  <td>{m.lastPeriod ? formatPeriod(m.lastPeriod, m.series.freq) : <span className="muted">—</span>}</td>
                  <td className="num">{m.lastValue === null ? '—' : formatValue(m.lastValue, m.series.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
