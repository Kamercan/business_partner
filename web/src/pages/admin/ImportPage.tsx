import { useState } from 'react';
import { ApiError, api } from '../../api/client';
import { useToast } from '../../components/ui';
import { SOURCE, label } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type ImportResult = {
  imported: number;
  skipped: number;
  duplicates: number;
  total: number;
  errors: Array<{ line: number; error: string }>;
  detectedColumns: string[];
  dryRun: boolean;
  preview?: Array<{ line: number; company_name: string; email?: string | null; city?: string | null; categories?: string[]; action: string; existing_ref?: string }>;
};

/**
 * EYDEP / TurkishExporter gibi dış kaynaklardan alınan listeleri
 * başvuru havuzuna aktarır. Önce kuru çalıştırma ile önizleme yapılır.
 */
export default function ImportPage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('EYDEP');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('source', source);
      if (dryRun) form.append('dry_run', 'true');
      const data = await api.upload<ImportResult>('/admin/imports/applications', form);
      setResult(data);
      if (!dryRun) toast.push(`${data.imported} kayıt havuza eklendi.`, 'ok');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'İçe aktarım başarısız.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Liste İçe Aktar" subtitle="EYDEP, TurkishExporter, fuar ve LinkedIn listelerini havuza ekleyin" />
      <div className="admin-content">
        <div className="detail-grid">
          <div className="stack">
            <div className="card">
              <div className="card-title">CSV dosyası</div>
              <div className="stack">
                <div className="field">
                  <label>Dosya</label>
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <span className="hint">Ayraç olarak virgül veya noktalı virgül kullanılabilir. UTF-8 önerilir.</span>
                </div>
                <div className="field">
                  <label>Kaynak etiketi</label>
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    {['EYDEP', 'TURKISHEXPORTER', 'LINKEDIN', 'EMAIL', 'FAIR', 'REFERRAL', 'IMPORT', 'OTHER'].map((s) => (
                      <option key={s} value={s}>
                        {label(SOURCE, s)}
                      </option>
                    ))}
                  </select>
                  <span className="hint">Aktarılan kayıtlar bu kaynakla etiketlenir; panelde filtrelenebilir.</span>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => run(true)} disabled={!file || busy} type="button">
                    {busy && <span className="spinner" />} Önizle
                  </button>
                  <button className="btn btn-primary" onClick={() => run(false)} disabled={!file || busy} type="button">
                    İçe aktar
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => api.download('/admin/imports/template', 'tedarikci-import-sablonu.csv').catch(() => undefined)}
                  >
                    Şablon indir
                  </button>
                </div>
              </div>
            </div>

            {result && (
              <div className="card">
                <div className="card-title">{result.dryRun ? 'Önizleme sonucu' : 'İçe aktarım sonucu'}</div>
                <div className="kpi-grid" style={{ marginBottom: 16 }}>
                  <div className="kpi ok">
                    <span className="kpi-label">{result.dryRun ? 'Aktarılacak' : 'Aktarılan'}</span>
                    <span className="kpi-value">{result.imported}</span>
                  </div>
                  <div className="kpi warn">
                    <span className="kpi-label">Mükerrer (atlanan)</span>
                    <span className="kpi-value">{result.duplicates}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">Boş / geçersiz</span>
                    <span className="kpi-value">{result.skipped}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">Toplam satır</span>
                    <span className="kpi-value">{result.total}</span>
                  </div>
                </div>

                <div className="small muted" style={{ marginBottom: 12 }}>
                  Tanınan sütunlar: {result.detectedColumns.join(', ') || 'yok'}
                </div>

                {result.errors.length > 0 && (
                  <div className="form-error">
                    {result.errors.slice(0, 10).map((e) => (
                      <div key={e.line}>
                        Satır {e.line}: {e.error}
                      </div>
                    ))}
                  </div>
                )}

                {result.preview && result.preview.length > 0 && (
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Satır</th>
                          <th>Firma</th>
                          <th>E-posta</th>
                          <th>Şehir</th>
                          <th>Ürün grupları</th>
                          <th>Sonuç</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.preview.map((p) => (
                          <tr key={p.line}>
                            <td className="small">{p.line}</td>
                            <td className="company">{p.company_name}</td>
                            <td className="small">{p.email ?? '—'}</td>
                            <td className="small">{p.city ?? '—'}</td>
                            <td className="small">{p.categories?.join(', ') || '—'}</td>
                            <td>
                              {p.action === 'duplicate' ? (
                                <span className="badge badge-warn">mükerrer · {p.existing_ref}</span>
                              ) : (
                                <span className="badge badge-ok">eklenecek</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Nasıl çalışır?</div>
            <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--ink-2)' }}>
              <li>Şablonu indirip listenizi bu formata getirin (veya kendi başlıklarınızı kullanın).</li>
              <li>
                Sistem başlıkları otomatik tanır: <em>Firma Adı, Vergi No, Yetkili Kişi, E-posta, Telefon, Ülke, Şehir, Web
                Sitesi, Sektör, Ürün Grubu, Açıklama</em>.
              </li>
              <li>Ürün grupları Türkçe adıyla veya kodla yazılabilir; birden fazlası <code>|</code> ile ayrılır.</li>
              <li>Firma adı, vergi no veya e-posta eşleşen kayıtlar mükerrer sayılır ve atlanır.</li>
              <li>Önce "Önizle" ile kontrol edin, sonra "İçe aktar" ile havuza ekleyin.</li>
            </ol>
            <div className="small muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
              Aktarılan kayıtlar <strong>Yeni</strong> durumunda havuza düşer ve normal değerlendirme akışına girer. KVKK
              onayı web formu dışından geldiği için işaretlenmez; bu kayıtlarla iletişime geçmeden önce açık rıza almanız
              gerekir.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
