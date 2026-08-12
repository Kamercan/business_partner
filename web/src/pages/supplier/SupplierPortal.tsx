import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { Badge, FileSlot, Grade, Loading, Modal, useToast } from '../../components/ui';
import { supplierToken } from '../../auth/supplierSession';
import {
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  NCR_CATEGORY,
  NCR_SEVERITY,
  NCR_STATUS,
  SUPPLIER_STATUS,
  formatBytes,
  formatDate,
  formatMoney,
  label,
  tone,
} from '../../lib/labels';
import { YanmarLogo } from '../public/PublicShell';

type Me = {
  supplier: {
    supplier_code: string; company_name: string; tax_id: string; country: string; city: string | null;
    contact_name: string | null; email: string; phone: string | null; grade: string | null; status: string;
    approved_at: string | null; next_audit_due: string | null; otd_percent: number | null; ppm: number | null;
    categories: string;
  };
  summary: { openNcrs: number; pendingResponse: number; activeContracts: number };
  messages: Array<{ body: string; created_at: string }>;
};

type Ncr = {
  id: number; ncr_no: string; title: string; category: string; severity: string; description: string;
  part_no: string | null; qty_affected: number | null; detected_at: string | null; due_date: string | null;
  status: string; containment: string | null; root_cause: string | null; corrective_action: string | null;
  preventive_action: string | null; responded_at: string | null; is_overdue: number;
};

type Doc = {
  id: number; owner_type: string; kind: string; original_name: string; size_bytes: number;
  created_at: string; uploaded_by_supplier: number; related_no: string | null;
};

type Contract = {
  id: number; contract_no: string; title: string; type: string; status: string;
  start_date: string | null; end_date: string | null; currency: string; value: number | null;
};

type Tab = 'ozet' | 'uygunsuzluk' | 'belge' | 'sozlesme';

/** Onaylı tedarikçinin kendi alanı — parolayla giriş yaptıktan sonra. */
export default function SupplierPortal() {
  const navigate = useNavigate();
  const toast = useToast();

  const [me, setMe] = useState<Me | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('ozet');
  const [ncrs, setNcrs] = useState<Ncr[] | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [respondTo, setRespondTo] = useState<Ncr | null>(null);
  const [form, setForm] = useState({ containment: '', root_cause: '', corrective_action: '', preventive_action: '' });
  const [pwModal, setPwModal] = useState(false);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });

  const load = useCallback(() => {
    api
      .get<Me>('/supplier/me')
      .then(setMe)
      .catch(() => setAuthFailed(true));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!me) return;
    if (tab === 'uygunsuzluk' && !ncrs) api.get<Ncr[]>('/supplier/ncrs').then(setNcrs).catch(() => setNcrs([]));
    if (tab === 'belge' && !docs) api.get<Doc[]>('/supplier/documents').then(setDocs).catch(() => setDocs([]));
    if (tab === 'sozlesme' && !contracts) api.get<Contract[]>('/supplier/contracts').then(setContracts).catch(() => setContracts([]));
  }, [tab, me, ncrs, docs, contracts]);

  if (authFailed || !supplierToken.get()) return <Navigate to="/business-partner?giris=tedarikci" replace />;
  if (!me) return <Loading />;

  async function logout() {
    try {
      await api.post('/supplier/logout');
    } finally {
      supplierToken.clear();
      navigate('/business-partner?giris=tedarikci');
    }
  }

  async function uploadDocs() {
    if (!files?.length) return;
    setBusy(true);
    try {
      const body = new FormData();
      files.forEach((f) => body.append('files', f));
      await api.upload('/supplier/documents', body);
      toast.push('Belgeleriniz yüklendi, Yanmar ekibine iletildi.', 'ok');
      setFiles(null);
      setDocs(null);
      api.get<Doc[]>('/supplier/documents').then(setDocs).catch(() => undefined);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Yükleme başarısız.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse() {
    if (!respondTo) return;
    setBusy(true);
    try {
      await api.post(`/supplier/ncrs/${respondTo.id}/respond`, form);
      toast.push('Düzeltici faaliyet planınız iletildi.', 'ok');
      setRespondTo(null);
      setNcrs(null);
      api.get<Ncr[]>('/supplier/ncrs').then(setNcrs).catch(() => undefined);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Gönderilemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      await api.post('/supplier/change-password', pw);
      toast.push('Parolanız güncellendi.', 'ok');
      setPwModal(false);
      setPw({ current_password: '', new_password: '' });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Güncellenemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const s = me.supplier;

  return (
    <div className="bp-gate">
      <header className="bp-gate-top">
        <YanmarLogo />
        <div className="row">
          <span className="small muted nowrap">{s.company_name}</span>
          <button className="btn btn-sm" onClick={() => setPwModal(true)} type="button">
            Parola
          </button>
          <button className="btn btn-sm" onClick={logout} type="button">
            Çıkış
          </button>
        </div>
      </header>

      <main className="bp-gate-body" style={{ maxWidth: 900 }}>
        <h1>Tedarikçi Portalı</h1>
        <p className="bp-gate-lead">
          {s.supplier_code} · {s.city ?? ''} {s.country.toUpperCase()}
        </p>

        <div className="row wrap" style={{ gap: 10, marginBottom: 20 }}>
          <Badge tone={tone(SUPPLIER_STATUS, s.status)}>{label(SUPPLIER_STATUS, s.status)}</Badge>
          {s.grade && (
            <span className="row" style={{ gap: 6 }}>
              <span className="small muted">Kalite notunuz:</span>
              <Grade grade={s.grade} />
            </span>
          )}
          {me.summary.pendingResponse > 0 && (
            <Badge tone="danger">{me.summary.pendingResponse} uygunsuzluk cevabınızı bekliyor</Badge>
          )}
        </div>

        <div className="tabs">
          {([
            ['ozet', 'Özet'],
            ['uygunsuzluk', `Uygunsuzluklar${me.summary.openNcrs ? ` (${me.summary.openNcrs})` : ''}`],
            ['belge', 'Belgeler'],
            ['sozlesme', `Sözleşmeler${me.summary.activeContracts ? ` (${me.summary.activeContracts})` : ''}`],
          ] as Array<[Tab, string]>).map(([key, text]) => (
            <button key={key} type="button" className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {text}
            </button>
          ))}
        </div>

        {/* ------------------------------- Özet -------------------------------- */}
        {tab === 'ozet' && (
          <div className="bp-panel">
            <dl className="kv">
              <dt>Firma</dt>
              <dd>{s.company_name}</dd>
              <dt>Tedarikçi kodu</dt>
              <dd className="mono">{s.supplier_code}</dd>
              <dt>Vergi no</dt>
              <dd className="mono">{s.tax_id}</dd>
              <dt>Yetkili</dt>
              <dd>{s.contact_name ?? '—'}</dd>
              <dt>E-posta</dt>
              <dd>{s.email}</dd>
              <dt>Onay tarihi</dt>
              <dd>{formatDate(s.approved_at)}</dd>
              <dt>Sonraki denetim</dt>
              <dd>{formatDate(s.next_audit_due)}</dd>
              <dt>Zamanında teslimat</dt>
              <dd>{s.otd_percent !== null ? `%${s.otd_percent}` : '—'}</dd>
              <dt>PPM</dt>
              <dd>{s.ppm ?? '—'}</dd>
            </dl>

            {me.messages.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 22 }}>
                  Yanmar ekibinden mesajlar
                </div>
                {me.messages.map((m, i) => (
                  <div className="message-item" key={i}>
                    {m.body}
                    <time>{formatDate(m.created_at, true)}</time>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* --------------------------- Uygunsuzluklar --------------------------- */}
        {tab === 'uygunsuzluk' && (
          <div className="bp-panel">
            {!ncrs ? (
              <Loading />
            ) : ncrs.length === 0 ? (
              <div className="empty">Firmanıza açılmış bir uygunsuzluk kaydı yok.</div>
            ) : (
              ncrs.map((n) => (
                <div key={n.id} className="sp-item">
                  <div className="row-between wrap" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="small muted mono">{n.ncr_no}</div>
                      <strong style={{ fontSize: 15 }}>{n.title}</strong>
                    </div>
                    <div className="row wrap">
                      <Badge tone={tone(NCR_SEVERITY, n.severity)}>{label(NCR_SEVERITY, n.severity)}</Badge>
                      <Badge tone={tone(NCR_STATUS, n.status)}>{label(NCR_STATUS, n.status)}</Badge>
                      {n.is_overdue === 1 && <Badge tone="danger">Termin geçti</Badge>}
                    </div>
                  </div>

                  <div className="message-item">{n.description}</div>

                  <div className="row wrap small muted" style={{ gap: 16, marginTop: 8 }}>
                    <span>Kategori: {label(NCR_CATEGORY, n.category)}</span>
                    {n.part_no && <span>Parça: {n.part_no}</span>}
                    {n.qty_affected !== null && <span>Adet: {n.qty_affected}</span>}
                    {n.due_date && <span>Son cevap: <strong>{formatDate(n.due_date)}</strong></span>}
                  </div>

                  {n.root_cause && (
                    <div className="sp-answer">
                      <div className="small muted">Gönderdiğiniz cevap</div>
                      <div><strong>Kök neden:</strong> {n.root_cause}</div>
                      <div><strong>Düzeltici faaliyet:</strong> {n.corrective_action}</div>
                      {n.responded_at && <div className="small muted">{formatDate(n.responded_at, true)}</div>}
                    </div>
                  )}

                  {['OPEN', 'REJECTED'].includes(n.status) && (
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      type="button"
                      onClick={() => {
                        setRespondTo(n);
                        setForm({
                          containment: n.containment ?? '',
                          root_cause: n.root_cause ?? '',
                          corrective_action: n.corrective_action ?? '',
                          preventive_action: n.preventive_action ?? '',
                        });
                      }}
                    >
                      {n.status === 'REJECTED' ? 'Cevabı yeniden gönder' : 'Düzeltici faaliyet gir (8D)'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ------------------------------ Belgeler ------------------------------ */}
        {tab === 'belge' && (
          <div className="bp-panel">
            <div className="section-label">Belge yükle</div>
            <FileSlot
              title="Dosya seçin"
              meta="PDF, Office belgeleri, görseller · max 20 MB"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
              multiple
              file={files}
              onSelect={setFiles}
              labels={{ required: 'Zorunlu', optional: 'Opsiyonel', remove: 'Kaldır' }}
            />
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={uploadDocs} disabled={!files?.length || busy} type="button">
              {busy && <span className="spinner" />}
              Yükle
            </button>

            <div className="section-label" style={{ marginTop: 26 }}>
              Belgeler
            </div>
            {!docs ? (
              <Loading />
            ) : docs.length === 0 ? (
              <div className="empty">Henüz belge yok.</div>
            ) : (
              docs.map((d) => (
                <div className={`doc-item ${d.uploaded_by_supplier ? 'supplier-doc' : ''}`} key={d.id}>
                  <div style={{ flex: 1 }}>
                    <div className="doc-name">{d.original_name}</div>
                    <div className="doc-meta">
                      {formatBytes(d.size_bytes)} · {formatDate(d.created_at)}
                      {d.related_no && ` · ${d.related_no}`}
                      {d.uploaded_by_supplier ? ' · sizin yüklediğiniz' : ' · Yanmar paylaştı'}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => api.download(`/supplier/documents/${d.id}/download`, d.original_name).catch((e) => toast.push(e.message, 'error'))}
                  >
                    İndir
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ----------------------------- Sözleşmeler ---------------------------- */}
        {tab === 'sozlesme' && (
          <div className="bp-panel">
            {!contracts ? (
              <Loading />
            ) : contracts.length === 0 ? (
              <div className="empty">Kayıtlı sözleşme yok.</div>
            ) : (
              contracts.map((c) => (
                <div className="row-between wrap sp-item" key={c.id}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{c.title}</strong>
                    <div className="small muted">
                      {c.contract_no} · {label(CONTRACT_TYPE, c.type)}
                      {c.start_date && ` · ${formatDate(c.start_date)}`}
                      {c.end_date && ` — ${formatDate(c.end_date)}`}
                    </div>
                  </div>
                  <div className="row">
                    <span className="small muted">{formatMoney(c.value, c.currency)}</span>
                    <Badge tone={tone(CONTRACT_STATUS, c.status)}>{label(CONTRACT_STATUS, c.status)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* --------------------------- 8D cevap modalı --------------------------- */}
      {respondTo && (
        <Modal
          title={`Düzeltici faaliyet — ${respondTo.ncr_no}`}
          subtitle={respondTo.title}
          onClose={() => setRespondTo(null)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setRespondTo(null)} type="button">
                  Vazgeç
                </button>
                <button
                  className="btn btn-primary"
                  onClick={submitResponse}
                  disabled={busy || form.root_cause.trim().length < 10 || form.corrective_action.trim().length < 10}
                  type="button"
                >
                  {busy && <span className="spinner" />} Gönder
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>Acil önlem (D3)</label>
              <textarea rows={2} value={form.containment} onChange={(e) => setForm({ ...form, containment: e.target.value })} placeholder="Etkilenen ürünler için aldığınız acil önlemler..." />
            </div>
            <div className="field">
              <label>
                Kök neden analizi (D4) <span className="req">*</span>
              </label>
              <textarea rows={3} value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} placeholder="5 neden / balık kılçığı analizi sonucu tespit edilen kök neden..." />
            </div>
            <div className="field">
              <label>
                Düzeltici faaliyet (D5-D6) <span className="req">*</span>
              </label>
              <textarea rows={3} value={form.corrective_action} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} placeholder="Kök nedeni ortadan kaldıracak faaliyetler ve termin tarihleri..." />
            </div>
            <div className="field">
              <label>Önleyici faaliyet (D7)</label>
              <textarea rows={2} value={form.preventive_action} onChange={(e) => setForm({ ...form, preventive_action: e.target.value })} placeholder="Tekrarını önleyecek sistemsel iyileştirmeler..." />
            </div>
          </div>
        </Modal>
      )}

      {/* ---------------------------- Parola değiştir --------------------------- */}
      {pwModal && (
        <Modal
          title="Parola değiştir"
          size="sm"
          onClose={() => setPwModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setPwModal(false)} type="button">
                  Vazgeç
                </button>
                <button className="btn btn-primary" onClick={changePassword} disabled={busy || pw.new_password.length < 8} type="button">
                  {busy && <span className="spinner" />} Kaydet
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>Mevcut parola</label>
              <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </div>
            <div className="field">
              <label>Yeni parola</label>
              <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <span className="hint">En az 8 karakter, harf ve rakam içermeli.</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
