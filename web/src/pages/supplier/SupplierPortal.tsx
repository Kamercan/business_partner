import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { Badge, FileSlot, Grade, Loading, Modal, useToast } from '../../components/ui';
import { supplierToken } from '../../auth/supplierSession';
import { useI18n } from '../../i18n';
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
import { extractLinks } from '../../lib/mailLinks';
import { LangToggle, YanmarLogo } from '../public/PublicShell';

type Me = {
  supplier: {
    supplier_code: string; company_name: string; tax_id: string; country: string; city: string | null;
    contact_name: string | null; email: string; phone: string | null; grade: string | null; status: string;
    approved_at: string | null; next_audit_due: string | null; otd_percent: number | null; ppm: number | null;
    categories: string;
    /** Ülkenin üç dildeki adı — ham kod yerine bu gösterilir. */
    country_label: { name_tr: string; name_en: string; name_ja: string };
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

type Mail = {
  id: number; subject: string; template: string | null; status: string;
  created_at: string; sent_at: string | null; body_html?: string;
};

type Submission = {
  id: number; action: string; entity_type: string; entity_id: number;
  detail: string | null; created_at: string; ncr_no: string | null;
};

type Tab = 'ozet' | 'uygunsuzluk' | 'belge' | 'sozlesme' | 'yazisma';

/** Tedarikçinin kendi gönderdiklerinin okunabilir başlıkları. */
const SUBMISSION_LABEL = {
  SUPPLIER_DOCUMENT_UPLOADED: 'sp.sub.doc',
  STATUS_CHANGED: 'sp.sub.ncr',
} as const;

/** Onaylı tedarikçinin kendi alanı — parolayla giriş yaptıktan sonra. */
export default function SupplierPortal() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang, pick } = useI18n();

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
  const [box, setBox] = useState<'gelen' | 'giden'>('gelen');
  const [mails, setMails] = useState<Mail[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [mailPreview, setMailPreview] = useState<Mail | null>(null);

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
    if (tab === 'yazisma' && box === 'gelen' && !mails) api.get<Mail[]>('/supplier/mails').then(setMails).catch(() => setMails([]));
    if (tab === 'yazisma' && box === 'giden' && !submissions)
      api.get<Submission[]>('/supplier/submissions').then(setSubmissions).catch(() => setSubmissions([]));
  }, [tab, me, ncrs, docs, contracts, box, mails, submissions]);

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
      toast.push(t('sp.toast.uploaded'), 'ok');
      setFiles(null);
      setDocs(null);
      api.get<Doc[]>('/supplier/documents').then(setDocs).catch(() => undefined);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('sp.toast.upload.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse() {
    if (!respondTo) return;
    setBusy(true);
    try {
      await api.post(`/supplier/ncrs/${respondTo.id}/respond`, form);
      toast.push(t('sp.toast.ncr.sent'), 'ok');
      setRespondTo(null);
      setNcrs(null);
      api.get<Ncr[]>('/supplier/ncrs').then(setNcrs).catch(() => undefined);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('sp.toast.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      await api.post('/supplier/change-password', pw);
      toast.push(t('sp.toast.pw.updated'), 'ok');
      setPwModal(false);
      setPw({ current_password: '', new_password: '' });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('sp.toast.pw.failed'), 'error');
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
          <LangToggle />
          <button className="btn btn-sm" onClick={() => setPwModal(true)} type="button">
            {t('sp.pw.btn')}
          </button>
          <button className="btn btn-sm" onClick={logout} type="button">
            {t('sp.logout')}
          </button>
        </div>
      </header>

      <main className="bp-gate-body" style={{ maxWidth: 900 }}>
        <h1>{t('sp.title')}</h1>
        <p className="bp-gate-lead">
          {s.supplier_code} · {[s.city, pick(s.country_label)].filter(Boolean).join(', ')}
        </p>

        <div className="row wrap" style={{ gap: 10, marginBottom: 20 }}>
          <Badge tone={tone(SUPPLIER_STATUS, s.status)}>{label(SUPPLIER_STATUS, s.status, lang)}</Badge>
          {s.grade && (
            <span className="row" style={{ gap: 6 }}>
              <span className="small muted">{t('sp.grade')}</span>
              <Grade grade={s.grade} />
            </span>
          )}
          {me.summary.pendingResponse > 0 && (
            <Badge tone="danger">{t('sp.pending', { count: me.summary.pendingResponse })}</Badge>
          )}
        </div>

        <div className="tabs">
          {([
            ['ozet', t('sp.tab.summary')],
            ['uygunsuzluk', `${t('sp.tab.ncr')}${me.summary.openNcrs ? ` (${me.summary.openNcrs})` : ''}`],
            ['belge', t('sp.tab.docs')],
            ['sozlesme', `${t('sp.tab.contracts')}${me.summary.activeContracts ? ` (${me.summary.activeContracts})` : ''}`],
            ['yazisma', t('sp.tab.mail')],
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
              <dt>{t('sp.kv.company')}</dt>
              <dd>{s.company_name}</dd>
              <dt>{t('sp.kv.code')}</dt>
              <dd className="mono">{s.supplier_code}</dd>
              <dt>{t('sp.kv.tax')}</dt>
              <dd className="mono">{s.tax_id}</dd>
              <dt>{t('sp.kv.contact')}</dt>
              <dd>{s.contact_name ?? '—'}</dd>
              <dt>{t('f.email')}</dt>
              <dd>{s.email}</dd>
              <dt>{t('sp.kv.approved')}</dt>
              <dd>{formatDate(s.approved_at, false, lang)}</dd>
              <dt>{t('sp.kv.next.audit')}</dt>
              <dd>{formatDate(s.next_audit_due, false, lang)}</dd>
              <dt>{t('sp.kv.otd')}</dt>
              <dd>{s.otd_percent !== null ? `${s.otd_percent}%` : '—'}</dd>
              <dt>{t('sp.kv.ppm')}</dt>
              <dd>{s.ppm ?? '—'}</dd>
            </dl>

            {me.messages.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 22 }}>
                  {t('sp.messages')}
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
              <div className="empty">{t('sp.ncr.empty')}</div>
            ) : (
              ncrs.map((n) => (
                <div key={n.id} className="sp-item">
                  <div className="row-between wrap" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="small muted mono">{n.ncr_no}</div>
                      <strong style={{ fontSize: 15 }}>{n.title}</strong>
                    </div>
                    <div className="row wrap">
                      <Badge tone={tone(NCR_SEVERITY, n.severity)}>{label(NCR_SEVERITY, n.severity, lang)}</Badge>
                      <Badge tone={tone(NCR_STATUS, n.status)}>{label(NCR_STATUS, n.status, lang)}</Badge>
                      {n.is_overdue === 1 && <Badge tone="danger">{t('sp.ncr.overdue')}</Badge>}
                    </div>
                  </div>

                  <div className="message-item">{n.description}</div>

                  <div className="row wrap small muted" style={{ gap: 16, marginTop: 8 }}>
                    <span>{t('sp.ncr.category')}: {label(NCR_CATEGORY, n.category, lang)}</span>
                    {n.part_no && <span>{t('sp.ncr.part')}: {n.part_no}</span>}
                    {n.qty_affected !== null && <span>{t('sp.ncr.qty')}: {n.qty_affected}</span>}
                    {n.due_date && <span>{t('sp.ncr.due')}: <strong>{formatDate(n.due_date, false, lang)}</strong></span>}
                  </div>

                  {n.root_cause && (
                    <div className="sp-answer">
                      <div className="small muted">{t('sp.ncr.answer')}</div>
                      <div><strong>{t('sp.ncr.root')}:</strong> {n.root_cause}</div>
                      <div><strong>{t('sp.ncr.corrective')}:</strong> {n.corrective_action}</div>
                      {n.responded_at && <div className="small muted">{formatDate(n.responded_at, true, lang)}</div>}
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
                      {n.status === 'REJECTED' ? t('sp.ncr.resend') : t('sp.ncr.respond')}
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
            <div className="section-label">{t('sp.doc.upload')}</div>
            <FileSlot
              title={t('sp.doc.pick')}
              meta={t('sp.doc.meta')}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
              multiple
              file={files}
              onSelect={setFiles}
              labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
            />
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={uploadDocs} disabled={!files?.length || busy} type="button">
              {busy && <span className="spinner" />}
              {t('btn.upload')}
            </button>

            <div className="section-label" style={{ marginTop: 26 }}>
              {t('sp.doc.list')}
            </div>
            {!docs ? (
              <Loading />
            ) : docs.length === 0 ? (
              <div className="empty">{t('sp.doc.empty')}</div>
            ) : (
              docs.map((d) => (
                <div className={`doc-item ${d.uploaded_by_supplier ? 'supplier-doc' : ''}`} key={d.id}>
                  <div style={{ flex: 1 }}>
                    <div className="doc-name">{d.original_name}</div>
                    <div className="doc-meta">
                      {formatBytes(d.size_bytes)} · {formatDate(d.created_at, false, lang)}
                      {d.related_no && ` · ${d.related_no}`}
                      {` · ${d.uploaded_by_supplier ? t('sp.doc.mine') : t('sp.doc.theirs')}`}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => api.download(`/supplier/documents/${d.id}/download`, d.original_name).catch((e) => toast.push(e.message, 'error'))}
                  >
                    {t('btn.download')}
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
              <div className="empty">{t('sp.contract.empty')}</div>
            ) : (
              contracts.map((c) => (
                <div className="row-between wrap sp-item" key={c.id}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{c.title}</strong>
                    <div className="small muted">
                      {c.contract_no} · {label(CONTRACT_TYPE, c.type, lang)}
                      {c.start_date && ` · ${formatDate(c.start_date, false, lang)}`}
                      {c.end_date && ` — ${formatDate(c.end_date, false, lang)}`}
                    </div>
                  </div>
                  <div className="row">
                    <span className="small muted">{formatMoney(c.value, c.currency, lang)}</span>
                    <Badge tone={tone(CONTRACT_STATUS, c.status)}>{label(CONTRACT_STATUS, c.status, lang)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ------------------------------ Yazışmalar ---------------------------- */}
        {tab === 'yazisma' && (
          <div className="bp-panel">
            <div className="tabs" style={{ marginTop: -4 }}>
              {([
                ['gelen', t('sp.box.in')],
                ['giden', t('sp.box.out')],
              ] as Array<['gelen' | 'giden', string]>).map(([key, text]) => (
                <button key={key} type="button" className={`tab ${box === key ? 'active' : ''}`} onClick={() => setBox(key)}>
                  {text}
                </button>
              ))}
            </div>

            {box === 'gelen' ? (
              <>
                <p className="small muted" style={{ marginBottom: 12 }}>
                  {t('sp.box.in.hint')}
                </p>
                {!mails ? (
                  <Loading />
                ) : mails.length === 0 ? (
                  <div className="empty">{t('sp.box.in.empty')}</div>
                ) : (
                  mails.map((m) => (
                    <div className="row-between wrap sp-item" key={m.id}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{m.subject}</strong>
                        <div className="small muted">{formatDate(m.created_at, true, lang)}</div>
                      </div>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => api.get<Mail>(`/supplier/mails/${m.id}`).then(setMailPreview).catch(() => undefined)}
                      >
                        {t('btn.open')}
                      </button>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <p className="small muted" style={{ marginBottom: 12 }}>
                  {t('sp.box.out.hint')}
                </p>
                {!submissions ? (
                  <Loading />
                ) : submissions.length === 0 ? (
                  <div className="empty">{t('sp.box.out.empty')}</div>
                ) : (
                  submissions.map((x) => (
                    <div className="sp-item" key={x.id}>
                      <div className="row-between wrap">
                        <strong style={{ fontSize: 14 }}>
                          {x.action in SUBMISSION_LABEL ? t(SUBMISSION_LABEL[x.action as keyof typeof SUBMISSION_LABEL]) : x.action}
                        </strong>
                        <span className="small muted">{formatDate(x.created_at, true, lang)}</span>
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {x.ncr_no && <span className="mono">{x.ncr_no} · </span>}
                        {x.detail ?? '—'}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* --------------------------- Bildirim önizleme -------------------------- */}
      {mailPreview && (
        <Modal title={mailPreview.subject} subtitle={formatDate(mailPreview.created_at, true, lang)} onClose={() => setMailPreview(null)}>
          {(() => {
            const links = mailPreview.body_html ? extractLinks(mailPreview.body_html) : [];
            return links.length > 0 ? (
              <div className="mail-links">
                <div className="section-label" style={{ marginBottom: 8 }}>
                  {t('mail.links.title')}
                </div>
                {links.map((l) => (
                  <a key={l.href} className="btn btn-sm" href={l.href} target="_blank" rel="noreferrer noopener">
                    {l.text} ↗
                  </a>
                ))}
                <div className="small muted" style={{ marginTop: 8, width: '100%' }}>
                  {t('mail.links.note')}
                </div>
              </div>
            ) : null;
          })()}
          <iframe
            title={t('mail.preview')}
            srcDoc={mailPreview.body_html}
            sandbox=""
            style={{ width: '100%', height: 420, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
          />
        </Modal>
      )}

      {/* --------------------------- 8D cevap modalı --------------------------- */}
      {respondTo && (
        <Modal
          title={`${t('sp.ncr.modal')} — ${respondTo.ncr_no}`}
          subtitle={respondTo.title}
          onClose={() => setRespondTo(null)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setRespondTo(null)} type="button">
                  {t('btn.give.up')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={submitResponse}
                  disabled={busy || form.root_cause.trim().length < 10 || form.corrective_action.trim().length < 10}
                  type="button"
                >
                  {busy && <span className="spinner" />} {t('btn.send')}
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>{t('sp.8d.containment')}</label>
              <textarea rows={2} value={form.containment} onChange={(e) => setForm({ ...form, containment: e.target.value })} placeholder={t('sp.8d.containment.ph')} />
            </div>
            <div className="field">
              <label>
                {t('sp.8d.root')} <span className="req">*</span>
              </label>
              <textarea rows={3} value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} placeholder={t('sp.8d.root.ph')} />
            </div>
            <div className="field">
              <label>
                {t('sp.8d.corrective')} <span className="req">*</span>
              </label>
              <textarea rows={3} value={form.corrective_action} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} placeholder={t('sp.8d.corrective.ph')} />
            </div>
            <div className="field">
              <label>{t('sp.8d.preventive')}</label>
              <textarea rows={2} value={form.preventive_action} onChange={(e) => setForm({ ...form, preventive_action: e.target.value })} placeholder={t('sp.8d.preventive.ph')} />
            </div>
          </div>
        </Modal>
      )}

      {/* ---------------------------- Parola değiştir --------------------------- */}
      {pwModal && (
        <Modal
          title={t('sp.pw.title')}
          size="sm"
          onClose={() => setPwModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setPwModal(false)} type="button">
                  {t('btn.give.up')}
                </button>
                <button className="btn btn-primary" onClick={changePassword} disabled={busy || pw.new_password.length < 8} type="button">
                  {busy && <span className="spinner" />} {t('btn.save')}
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>{t('sp.pw.current')}</label>
              <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('sp.pw.new')}</label>
              <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <span className="hint">{t('pw.rule')}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
