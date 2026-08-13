import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Grade, Loading, Modal, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { categoryNames, useMeta } from '../../hooks/useMeta';
import {
  ACTIVITY,
  APPLICATION_STATUS,
  AUDIT_STATUS,
  STATUS_ACTION,
  DOCUMENT_KIND,
  PRIORITY,
  formatBytes,
  formatDate,
  label,
  tone,
} from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Detail = {
  id: number;
  ref_no: string;
  company_name: string;
  tax_id: string;
  founded_year: number | null;
  employee_band: string | null;
  revenue_band: string | null;
  website: string | null;
  sector: string;
  sector_other: string | null;
  contact_name: string;
  contact_position: string | null;
  email: string;
  phone: string;
  country: string;
  country_other: string | null;
  city: string;
  address: string | null;
  references_text: string | null;
  about: string | null;
  category_other: string | null;
  kvkk_consent: number;
  consent_version: string | null;
  consent_at: string | null;
  status: string;
  priority: string;
  completeness: number;
  duplicate_of: number | null;
  assigned_to: number | null;
  decision_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  categories: string[];
  certifications: string[];
  documents: Array<{
    id: number; kind: string; original_name: string; size_bytes: number; visibility: string;
    created_at: string; uploaded_by_supplier: number; uploaded_by_name: string | null;
  }>;
  audits: Array<{ id: number; audit_no: string; status: string; planned_date: string | null; score: number | null; grade: string | null; auditor_name: string | null }>;
  notes: Array<{ id: number; body: string; visibility: string; created_at: string; author: string }>;
  supplier: { id: number; supplier_code: string; status: string; grade: string | null } | null;
  duplicates: Array<{ id: number; ref_no: string; company_name: string; status: string; created_at: string }>;
  activity: Array<{ id: number; action: string; actor_label: string; from_value: string | null; to_value: string | null; detail: string | null; created_at: string }>;
  allowedTransitions: string[];
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const { t, lang, pick } = useI18n();
  const { can, user, readOnly } = useAuth();

  const [data, setData] = useState<Detail | null>(null);
  const [users, setUsers] = useState<Array<{ id: number; full_name: string; role: string }>>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusModal, setStatusModal] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [infoModal, setInfoModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  const catNames = categoryNames(meta, lang);
  /** En güncel tamamlanmış denetimin notu — başlıkta özet olarak gösterilir. */
  const latestGrade = data?.audits.find((a) => a.grade)?.grade ?? null;

  const load = useCallback(() => {
    api
      .get<Detail>(`/admin/applications/${id}`)
      .then(setData)
      .catch((err) => toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error'));
  }, [id, toast]);

  useEffect(() => {
    load();
    api.get<Array<{ id: number; full_name: string; role: string }>>('/admin/users').then(setUsers).catch(() => undefined);
  }, [load]);

  if (!data) {
    return (
      <>
        <TopBar title={t('ad.title')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  async function changeStatus() {
    if (!statusModal) return;
    setBusy(true);
    try {
      await api.post(`/admin/applications/${id}/status`, {
        status: statusModal,
        note: statusNote || undefined,
        rejection_reason: ['REJECTED', 'DISQUALIFIED'].includes(statusModal) ? statusNote || undefined : undefined,
        notify,
      });
      toast.push(t('ad.status.updated'), 'ok');
      setStatusModal(null);
      setStatusNote('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.update.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/applications/${id}/notes`, { body: note.trim() });
      setNote('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Not eklenemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function requestInfo() {
    setBusy(true);
    try {
      await api.post(`/admin/applications/${id}/request-info`, { message: infoMessage.trim() });
      toast.push(t('ad.request.sent'), 'ok');
      setInfoModal(false);
      setInfoMessage('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.send.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assign(userId: string) {
    try {
      await api.patch(`/admin/applications/${id}`, { assigned_to: userId ? Number(userId) : null });
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('ad.assign.failed'), 'error');
    }
  }

  return (
    <>
      <TopBar
        title={data.company_name}
        subtitle={`${data.ref_no} · ${formatDate(data.created_at, true, lang)}`}
        actions={
          <>
            <Link className="btn btn-sm" to="/yonetim/basvurular">
              {t('ad.back')}
            </Link>
            {!readOnly &&
              data.allowedTransitions.map((s) => {
                const def = STATUS_ACTION[s];
                if (!def) return null;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`btn btn-sm ${def.variant === 'primary' ? 'btn-primary' : def.variant === 'danger' ? 'btn-danger' : ''}`}
                    onClick={() => setStatusModal(s)}
                  >
                    {label(STATUS_ACTION, s, lang)}
                  </button>
                );
              })}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-header">
          <div className="row-between wrap">
            <div className="row wrap" style={{ gap: 10 }}>
              <Badge tone={tone(APPLICATION_STATUS, data.status)}>{label(APPLICATION_STATUS, data.status, lang)}</Badge>
              {latestGrade && (
                <span className="row" style={{ gap: 6 }}>
                  <span className="small muted">{t('a.grade')}:</span>
                  <Grade grade={latestGrade} />
                </span>
              )}
              <Badge tone={tone(PRIORITY, data.priority)}>
                {t('a.priority')}: {label(PRIORITY, data.priority, lang)}
              </Badge>
              <span className="small muted">{t('ap.completeness')}: {data.completeness}/100</span>
              {data.supplier && (
                <Link to={`/yonetim/tedarikciler/${data.supplier.id}`} className="badge badge-ok">
                  {t('a.supplier')}: {data.supplier.supplier_code}
                </Link>
              )}
            </div>
            {!readOnly && (
              <div className="row">
                <span className="small muted">{t('a.owner')}:</span>
                <select
                  className="input"
                  style={{ width: 200 }}
                  value={data.assigned_to ?? ''}
                  onChange={(e) => assign(e.target.value)}
                >
                  <option value="">{t('a.unassigned')}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {data.duplicate_of && data.duplicates.length > 0 && (
            <div className="form-error" style={{ marginTop: 14, marginBottom: 0 }}>
              <strong>{t('ad.duplicate.warn')}</strong> {t('ad.duplicate.list')}{' '}
              {data.duplicates.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  <Link to={`/yonetim/basvurular/${d.id}`} style={{ textDecoration: 'underline' }}>
                    {d.ref_no}
                  </Link>{' '}
                  ({label(APPLICATION_STATUS, d.status, lang)})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="detail-grid">
          <div className="stack">
            {/* Firma bilgileri */}
            <div className="card">
              <div className="card-title">{t('a.company.info')}</div>
              <dl className="kv">
                <dt>{t('ad.company.name')}</dt>
                <dd>{data.company_name}</dd>
                <dt>{t('a.tax')}</dt>
                <dd className="mono">{data.tax_id}</dd>
                <dt>{t('a.sector')}</dt>
                <dd>
                  {(() => {
                    const sector = meta?.sectors.find((x) => x.code === data.sector);
                    return sector ? pick(sector) : data.sector;
                  })()}
                  {data.sector_other && ` — ${data.sector_other}`}
                </dd>
                <dt>{t('ad.founded')}</dt>
                <dd>{data.founded_year ?? '—'}</dd>
                <dt>{t('ad.employees')}</dt>
                <dd>{data.employee_band ?? '—'}</dd>
                <dt>{t('ad.revenue')}</dt>
                <dd>{data.revenue_band ?? '—'}</dd>
                <dt>{t('a.website')}</dt>
                <dd>
                  {data.website ? (
                    <a href={data.website} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--brand)' }}>
                      {data.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt>{t('a.location')}</dt>
                <dd>
                  {data.city} / {data.country_other ?? data.country.toUpperCase()}
                </dd>
                {data.address && (
                  <>
                    <dt>{t('a.address')}</dt>
                    <dd>{data.address}</dd>
                  </>
                )}
              </dl>
            </div>

            {/* İletişim */}
            <div className="card">
              <div className="card-title">{t('ad.contact')}</div>
              <dl className="kv">
                <dt>{t('ad.contact.person')}</dt>
                <dd>
                  {data.contact_name}
                  {data.contact_position && <span className="muted"> · {data.contact_position}</span>}
                </dd>
                <dt>{t('a.email')}</dt>
                <dd>
                  <a href={`mailto:${data.email}`} style={{ color: 'var(--brand)' }}>
                    {data.email}
                  </a>
                </dd>
                <dt>{t('a.phone')}</dt>
                <dd>{data.phone}</dd>
              </dl>
            </div>

            {/* Yetkinlikler */}
            <div className="card">
              <div className="card-title">{t('ad.capabilities')}</div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                {t('a.categories')}
              </div>
              <div className="cat-tags" style={{ maxWidth: 'none', marginBottom: 14 }}>
                {data.categories.map((c) => (
                  <span className="cat-tag" key={c}>
                    {catNames[c] ?? c}
                  </span>
                ))}
                {data.category_other && <span className="cat-tag">{t('ad.other')}: {data.category_other}</span>}
              </div>

              <div className="small muted" style={{ marginBottom: 6 }}>
                {t('ad.certs')}
              </div>
              <div className="cat-tags" style={{ maxWidth: 'none' }}>
                {data.certifications.length === 0 && <span className="small muted">Belirtilmedi</span>}
                {data.certifications.map((c) => (
                  <span className="cat-tag" key={c}>
                    {meta?.certifications.find((x) => x.code === c)?.name ?? c}
                  </span>
                ))}
              </div>

              {data.references_text && (
                <>
                  <div className="small muted" style={{ margin: '14px 0 6px' }}>
                    Referanslar
                  </div>
                  <div style={{ fontSize: 13 }}>{data.references_text}</div>
                </>
              )}
              {data.about && (
                <>
                  <div className="small muted" style={{ margin: '14px 0 6px' }}>
                    {t('ad.about')}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{data.about}</div>
                </>
              )}
            </div>

            {/* Belgeler */}
            <div className="card">
              <div className="card-title">{t('ad.docs.count')} ({data.documents.length})</div>
              {data.documents.length === 0 && <div className="small muted">{t('ad.no.documents')}</div>}
              {data.documents.map((doc) => (
                <div className={`doc-item ${doc.uploaded_by_supplier ? 'supplier-doc' : ''}`} key={doc.id}>
                  <div style={{ flex: 1 }}>
                    <div className="doc-name">{doc.original_name}</div>
                    <div className="doc-meta">
                      {label(DOCUMENT_KIND, doc.kind, lang)} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at, false, lang)}
                      {doc.uploaded_by_supplier ? ` · ${t('ad.by.supplier')}` : doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                    </div>
                  </div>
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

            {/* Notlar */}
            <div className="card">
              <div className="card-title">{t('a.notes')}</div>
              {!readOnly && (
                <div className="stack" style={{ marginBottom: 14 }}>
                  <textarea
                    className="input"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('ad.note.ph')}
                  />
                  <button className="btn btn-sm" onClick={addNote} disabled={!note.trim() || busy} type="button" style={{ alignSelf: 'flex-start' }}>
                    Not ekle
                  </button>
                </div>
              )}
              {data.notes.length === 0 && <div className="small muted">{t('ad.no.notes')}</div>}
              {data.notes.map((n) => (
                <div className={`note-item ${n.visibility === 'SHARED' ? 'shared' : ''}`} key={n.id}>
                  {n.body}
                  <div className="meta">
                    {n.author} · {formatDate(n.created_at, true, lang)}
                    {n.visibility === 'SHARED' && ` · ${t('ad.shared')}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------ Yan panel ----------------------------- */}
          <div className="stack">
            {!readOnly && (
              <div className="card">
                <div className="card-title">{t('ad.quick')}</div>
                <div className="stack">
                  <button className="btn btn-block" onClick={() => setInfoModal(true)} type="button">
                    {t('ad.request.info')}
                  </button>
                  {data.audits.length > 0 && (
                    <Link className="btn btn-block" to={`/yonetim/denetimler/${data.audits[0].id}`}>
                      {t('ad.open.audit')} ({data.audits[0].audit_no})
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Denetimler */}
            {data.audits.length > 0 && (
              <div className="card">
                <div className="card-title">{t('ad.audits')}</div>
                {data.audits.map((a) => (
                  <Link
                    to={`/yonetim/denetimler/${a.id}`}
                    key={a.id}
                    className="row-between"
                    style={{ padding: '9px 0', borderBottom: '1px solid #f4f4f4' }}
                  >
                    <div>
                      <div className="mono small">{a.audit_no}</div>
                      <div className="small muted">
                        {a.auditor_name ?? t('ad.no.auditor')}
                        {a.planned_date && ` · ${formatDate(a.planned_date, false, lang)}`}
                      </div>
                    </div>
                    <div className="row">
                      {a.score !== null && <span className="small muted">{a.score}</span>}
                      <Grade grade={a.grade} />
                      <Badge tone={tone(AUDIT_STATUS, a.status)}>{label(AUDIT_STATUS, a.status, lang)}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* KVKK kaydı */}
            <div className="card">
              <div className="card-title">{t('ad.kvkk')}</div>
              <dl className="kv">
                <dt>{t('a.approval')}</dt>
                <dd>{data.kvkk_consent ? t('ad.received') : t('ad.not.received')}</dd>
                <dt>{t('ad.kvkk.version')}</dt>
                <dd className="mono small">{data.consent_version ?? '—'}</dd>
                <dt>{t('ad.kvkk.time')}</dt>
                <dd>{formatDate(data.consent_at, true, lang)}</dd>
              </dl>
            </div>

            {/* Denetim izi */}
            <div className="card">
              <div className="card-title">{t('a.history')}</div>
              <div className="timeline">
                {data.activity.map((a, i) => (
                  <div className={`timeline-item ${i > 0 ? 'muted-dot' : ''}`} key={a.id}>
                    <span className="timeline-dot" />
                    <div className="timeline-body">
                      <strong>{label(ACTIVITY, a.action, lang)}</strong>
                      {a.from_value && a.to_value && (
                        <>
                          {': '}
                          {label(APPLICATION_STATUS, a.from_value, lang)} → {label(APPLICATION_STATUS, a.to_value, lang)}
                        </>
                      )}
                      {!a.from_value && a.to_value && a.action !== 'STATUS_CHANGED' && <>: {a.to_value}</>}
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

      {/* --------------------------- Durum değişikliği --------------------------- */}
      {statusModal && (
        <Modal
          title={STATUS_ACTION[statusModal] ? label(STATUS_ACTION, statusModal, lang) : t('ad.change.status')}
          size="sm"
          onClose={() => setStatusModal(null)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setStatusModal(null)} type="button">
                  {t('a.cancel')}
                </button>
                <button
                  className={`btn ${['REJECTED', 'DISQUALIFIED'].includes(statusModal) ? 'btn-danger' : 'btn-primary'}`}
                  onClick={changeStatus}
                  disabled={busy}
                  type="button"
                >
                  {busy && <span className="spinner" />} Onayla
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <p className="small" style={{ lineHeight: 1.6 }}>
              {t('ad.will.change', {
                company: data.company_name,
                status: label(APPLICATION_STATUS, statusModal, lang),
              })}
              {statusModal === 'AUDIT_PENDING' && ` ${t('ad.will.create.audit')}`}
              {statusModal === 'APPROVED' && ` ${t('ad.will.create.supplier')}`}
            </p>
            <div className="field">
              <label>{['REJECTED', 'DISQUALIFIED'].includes(statusModal) ? t('ad.reason') : t('ad.note.optional')}</label>
              <textarea rows={3} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              {t('ad.notify.supplier')}
            </label>
          </div>
        </Modal>
      )}

      {/* ----------------------------- Bilgi talebi ----------------------------- */}
      {infoModal && (
        <Modal
          title={t('ad.request.info.title')}
          size="sm"
          onClose={() => setInfoModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setInfoModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={requestInfo} disabled={busy || infoMessage.trim().length < 5} type="button">
                  {busy && <span className="spinner" />} {t('btn.send')}
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              {t('ad.request.info.hint')}
            </p>
            <div className="field">
              <label>{t('ad.requested')}</label>
              <textarea
                rows={5}
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder={t('ad.request.info.ph')}
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
