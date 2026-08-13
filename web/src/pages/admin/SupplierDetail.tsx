import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, FileSlot, Grade, Loading, Modal, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { categoryNames, useMeta } from '../../hooks/useMeta';
import {
  AUDIT_STATUS,
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  DOCUMENT_KIND,
  NCR_SEVERITY,
  NCR_STATUS,
  SUPPLIER_STATUS,
  formatBytes,
  formatDate,
  formatMoney,
  label,
  tone,
} from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Supplier = {
  id: number;
  supplier_code: string;
  company_name: string;
  tax_id: string;
  country: string;
  city: string | null;
  website: string | null;
  contact_name: string | null;
  email: string;
  phone: string | null;
  grade: string | null;
  status: string;
  approved_at: string | null;
  portal_enabled: number;
  portal_last_login_at: string | null;
  next_audit_due: string | null;
  otd_percent: number | null;
  ppm: number | null;
  notes: string | null;
  categories: string;
  application_id: number | null;
  ref_no: string | null;
  contracts: Array<{ id: number; contract_no: string; title: string; type: string; status: string; end_date: string | null; value: number | null; currency: string }>;
  ncrs: Array<{ id: number; ncr_no: string; title: string; severity: string; status: string; due_date: string | null }>;
  audits: Array<{ id: number; audit_no: string; status: string; score: number | null; grade: string | null; completed_at: string | null }>;
  documents: Array<{ id: number; kind: string; original_name: string; size_bytes: number; visibility: string; created_at: string; uploaded_by_supplier: number }>;
  activity: Array<{ id: number; action: string; actor_label: string; to_value: string | null; detail: string | null; created_at: string }>;
};

export default function SupplierDetail() {
  const { id } = useParams();
  const toast = useToast();
  const meta = useMeta();
  const { t, lang } = useI18n();
  const { can, readOnly } = useAuth();

  const [data, setData] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [edit, setEdit] = useState({ status: '', grade: '', otd_percent: '', ppm: '', next_audit_due: '' });
  const [files, setFiles] = useState<File[] | null>(null);
  const [shareWithSupplier, setShareWithSupplier] = useState(false);

  const catNames = categoryNames(meta, lang);

  const load = useCallback(() => {
    api
      .get<Supplier>(`/admin/suppliers/${id}`)
      .then((d) => {
        setData(d);
        setEdit({
          status: d.status,
          grade: d.grade ?? '',
          otd_percent: d.otd_percent?.toString() ?? '',
          ppm: d.ppm?.toString() ?? '',
          next_audit_due: d.next_audit_due ?? '',
        });
      })
      .catch((err) => toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error'));
  }, [id, toast]);

  useEffect(load, [load]);

  if (!data) {
    return (
      <>
        <TopBar title={t('su.detail')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/admin/suppliers/${id}`, {
        status: edit.status,
        grade: edit.grade || null,
        otd_percent: edit.otd_percent === '' ? null : Number(edit.otd_percent),
        ppm: edit.ppm === '' ? null : Number(edit.ppm),
        next_audit_due: edit.next_audit_due || null,
      });
      toast.push(t('su.updated'), 'ok');
      setEditModal(false);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.update.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!files?.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      form.append('owner_type', 'SUPPLIER');
      form.append('owner_id', String(id));
      form.append('kind', 'OTHER');
      form.append('visibility', shareWithSupplier ? 'SHARED' : 'INTERNAL');
      await api.upload('/admin/documents', form);
      toast.push(t('su.doc.uploaded'), 'ok');
      setFiles(null);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisibility(docId: number, current: string) {
    try {
      await api.patch(`/admin/documents/${docId}`, { visibility: current === 'SHARED' ? 'INTERNAL' : 'SHARED' });
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.update.failed'), 'error');
    }
  }

  return (
    <>
      <TopBar
        title={data.company_name}
        subtitle={`${data.supplier_code} · ${data.city ?? ''} ${data.country.toUpperCase()}`}
        actions={
          <>
            <Link className="btn btn-sm" to="/yonetim/tedarikciler">
              {t('su.back')}
            </Link>
            {data.application_id && (
              <Link className="btn btn-sm" to={`/yonetim/basvurular/${data.application_id}`}>
                {t('au.open.application')}
              </Link>
            )}
            {!readOnly && (
              <>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await api.post<{ message: string }>(`/admin/suppliers/${id}/portal-invite`);
                      toast.push(r.message, 'ok');
                    } catch (err) {
                      toast.push(err instanceof ApiError ? err.message : t('a.send.failed'), 'error');
                    }
                  }}
                >
                  {t('su.portal.invite')}
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setEditModal(true)} type="button">
                  {t('su.edit')}
                </button>
              </>
            )}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-header">
          <div className="row wrap" style={{ gap: 12 }}>
            <Badge tone={tone(SUPPLIER_STATUS, data.status)}>{label(SUPPLIER_STATUS, data.status, lang)}</Badge>
            <span className="row" style={{ gap: 6 }}>
              <span className="small muted">{t('a.grade')}:</span>
              <Grade grade={data.grade} />
            </span>
            <span className="small muted">
              {t('su.otd.col')}: <strong>{data.otd_percent !== null ? `%${data.otd_percent}` : '—'}</strong>
            </span>
            <span className="small muted">
              {t('su.ppm.col')}: <strong>{data.ppm ?? '—'}</strong>
            </span>
            <span className="small muted">
              {t('su.next.audit')}: <strong>{formatDate(data.next_audit_due, false, lang)}</strong>
            </span>
          </div>
          <div className="cat-tags" style={{ maxWidth: 'none', marginTop: 12 }}>
            {data.categories
              .split(',')
              .filter(Boolean)
              .map((c) => (
                <span className="cat-tag" key={c}>
                  {catNames[c] ?? c}
                </span>
              ))}
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            {/* Sözleşmeler */}
            <div className="card">
              <div className="card-title">
                {t('nav.contracts')} ({data.contracts.length})
                <Link className="small" to={`/yonetim/sozlesmeler?supplier_id=${data.id}`}>
                  {t('su.manage')}
                </Link>
              </div>
              {data.contracts.length === 0 && <div className="small muted">{t('su.no.contracts')}</div>}
              {data.contracts.map((c) => (
                <div className="row-between" key={c.id} style={{ padding: '9px 0', borderBottom: '1px solid #f4f4f4' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                    <div className="small muted">
                      {c.contract_no} · {label(CONTRACT_TYPE, c.type, lang)}
                      {c.end_date && ` · ${t('co.end')} ${formatDate(c.end_date, false, lang)}`}
                    </div>
                  </div>
                  <div className="row">
                    <span className="small muted">{formatMoney(c.value, c.currency, lang)}</span>
                    <Badge tone={tone(CONTRACT_STATUS, c.status)}>{label(CONTRACT_STATUS, c.status, lang)}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Uygunsuzluklar */}
            <div className="card">
              <div className="card-title">
                {t('nav.ncrs')} ({data.ncrs.length})
                <Link className="small" to={`/yonetim/uygunsuzluklar?supplier_id=${data.id}`}>
                  {t('su.manage')}
                </Link>
              </div>
              {data.ncrs.length === 0 && <div className="small muted">{t('su.no.ncrs')}</div>}
              {data.ncrs.map((n) => (
                <Link to={`/yonetim/uygunsuzluklar/${n.id}`} className="row-between" key={n.id} style={{ padding: '9px 0', borderBottom: '1px solid #f4f4f4' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                    <div className="small muted">
                      {n.ncr_no}
                      {n.due_date && ` · termin ${formatDate(n.due_date, false, lang)}`}
                    </div>
                  </div>
                  <div className="row">
                    <Badge tone={tone(NCR_SEVERITY, n.severity)}>{label(NCR_SEVERITY, n.severity, lang)}</Badge>
                    <Badge tone={tone(NCR_STATUS, n.status)}>{label(NCR_STATUS, n.status, lang)}</Badge>
                  </div>
                </Link>
              ))}
            </div>

            {/* Denetim geçmişi */}
            <div className="card">
              <div className="card-title">{t('su.audit.history')}</div>
              {data.audits.length === 0 && <div className="small muted">{t('su.no.audits')}</div>}
              {data.audits.map((a) => (
                <Link to={`/yonetim/denetimler/${a.id}`} className="row-between" key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid #f4f4f4' }}>
                  <div>
                    <div className="mono small" style={{ fontWeight: 600 }}>
                      {a.audit_no}
                    </div>
                    <div className="small muted">{formatDate(a.completed_at, false, lang)}</div>
                  </div>
                  <div className="row">
                    {a.score !== null && <span className="small muted">{a.score}</span>}
                    <Grade grade={a.grade} />
                    <Badge tone={tone(AUDIT_STATUS, a.status)}>{label(AUDIT_STATUS, a.status, lang)}</Badge>
                  </div>
                </Link>
              ))}
            </div>

            {/* Karşılıklı dosya paylaşımı */}
            <div className="card">
              <div className="card-title">{t('ad.docs.count')} ({data.documents.length})</div>
              {!readOnly && (
                <div style={{ marginBottom: 14 }}>
                  <FileSlot
                    title={t('sp.doc.upload')}
                    meta={t('su.doc.meta')}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                    multiple
                    file={files}
                    onSelect={setFiles}
                    labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
                  />
                  <div className="row" style={{ marginTop: 10 }}>
                    <label className="row small" style={{ gap: 7 }}>
                      <input type="checkbox" checked={shareWithSupplier} onChange={(e) => setShareWithSupplier(e.target.checked)} />
                      {t('su.share')}
                    </label>
                    <button className="btn btn-sm" onClick={upload} disabled={!files?.length || busy} type="button">
                      {t('a.upload')}
                    </button>
                  </div>
                </div>
              )}
              {data.documents.map((doc) => (
                <div className={`doc-item ${doc.uploaded_by_supplier ? 'supplier-doc' : ''}`} key={doc.id}>
                  <div style={{ flex: 1 }}>
                    <div className="doc-name">{doc.original_name}</div>
                    <div className="doc-meta">
                      {label(DOCUMENT_KIND, doc.kind, lang)} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at, false, lang)}
                      {doc.uploaded_by_supplier ? ` · ${t('ad.by.supplier')}` : ''}
                      {doc.visibility === 'SHARED' && ` · ${t('su.shared')}`}
                    </div>
                  </div>
                  {!readOnly && (
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => toggleVisibility(doc.id, doc.visibility)}>
                      {doc.visibility === 'SHARED' ? t('su.unshare') : t('su.share.short')}
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => api.download(`/admin/documents/${doc.id}/download`, doc.original_name).catch((e) => toast.push(e.message, 'error'))}
                  >
                    {t('a.download')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-title">{t('a.company.info')}</div>
              <dl className="kv">
                <dt>{t('su.code')}</dt>
                <dd className="mono">{data.supplier_code}</dd>
                <dt>{t('a.tax.short')}</dt>
                <dd className="mono">{data.tax_id}</dd>
                <dt>{t('su.contact')}</dt>
                <dd>{data.contact_name ?? '—'}</dd>
                <dt>{t('a.email')}</dt>
                <dd>
                  <a href={`mailto:${data.email}`} style={{ color: 'var(--brand)' }}>
                    {data.email}
                  </a>
                </dd>
                <dt>{t('a.phone')}</dt>
                <dd>{data.phone ?? '—'}</dd>
                <dt>{t('a.web')}</dt>
                <dd>{data.website ?? '—'}</dd>
                <dt>{t('sp.kv.approved')}</dt>
                <dd>{formatDate(data.approved_at, false, lang)}</dd>
                <dt>{t('su.portal.access')}</dt>
                <dd>
                  {data.portal_enabled ? (
                    <span className="badge badge-ok">Etkin</span>
                  ) : (
                    <span className="badge badge-neutral">{t('su.no.password')}</span>
                  )}
                </dd>
                <dt>{t('su.last.login')}</dt>
                <dd>{formatDate(data.portal_last_login_at, true, lang)}</dd>
              </dl>
            </div>

            <div className="card">
              <div className="card-title">{t('a.history')}</div>
              <div className="timeline">
                {data.activity.map((a, i) => (
                  <div className={`timeline-item ${i > 0 ? 'muted-dot' : ''}`} key={a.id}>
                    <span className="timeline-dot" />
                    <div className="timeline-body">
                      <strong>{a.action}</strong>
                      {a.to_value && <>: {a.to_value}</>}
                      {a.detail && <div className="muted">{a.detail}</div>}
                      <div className="who">
                        {a.actor_label} · {formatDate(a.created_at, true, lang)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {editModal && (
        <Modal
          title={t('su.edit.title')}
          size="sm"
          onClose={() => setEditModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setEditModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={save} disabled={busy} type="button">
                  {busy && <span className="spinner" />} Kaydet
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>{t('a.status')}</label>
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                {Object.keys(SUPPLIER_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(SUPPLIER_STATUS, s, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('a.grade')}</label>
              <select value={edit.grade} onChange={(e) => setEdit({ ...edit, grade: e.target.value })}>
                <option value="">{t('ad.not.received')}</option>
                {['A', 'B', 'C', 'D'].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>{t('su.otd')}</label>
                <input type="number" min="0" max="100" value={edit.otd_percent} onChange={(e) => setEdit({ ...edit, otd_percent: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('su.ppm')}</label>
                <input type="number" min="0" value={edit.ppm} onChange={(e) => setEdit({ ...edit, ppm: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t('su.next.audit.date')}</label>
              <input type="date" value={edit.next_audit_due} onChange={(e) => setEdit({ ...edit, next_audit_due: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
