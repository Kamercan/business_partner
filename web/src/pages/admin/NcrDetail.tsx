import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, FileSlot, Loading, useToast } from '../../components/ui';
import { ACTIVITY, NCR_CATEGORY, NCR_SEVERITY, NCR_STATUS, formatBytes, formatDate, label, tone } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Ncr = {
  id: number;
  ncr_no: string;
  supplier_id: number;
  company_name: string;
  supplier_code: string;
  title: string;
  category: string;
  severity: string;
  description: string;
  part_no: string | null;
  qty_affected: number | null;
  detected_at: string | null;
  due_date: string | null;
  status: string;
  containment: string | null;
  root_cause: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  effectiveness: string | null;
  responded_at: string | null;
  closed_at: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  is_overdue: number;
  documents: Array<{ id: number; original_name: string; size_bytes: number; created_at: string; uploaded_by_supplier: number }>;
  notes: Array<{ id: number; body: string; visibility: string; created_at: string; author: string }>;
  activity: Array<{ id: number; action: string; actor_label: string; from_value: string | null; to_value: string | null; detail: string | null; created_at: string }>;
};

export default function NcrDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const toast = useToast();
  const { can, readOnly } = useAuth();

  const [data, setData] = useState<Ncr | null>(null);
  const [busy, setBusy] = useState(false);
  const [effectiveness, setEffectiveness] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[] | null>(null);

  const load = useCallback(() => {
    api
      .get<Ncr>(`/admin/ncrs/${id}`)
      .then((d) => {
        setData(d);
        setEffectiveness(d.effectiveness ?? '');
      })
      .catch((err) => toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error'));
  }, [id, toast]);

  useEffect(load, [load]);

  if (!data) {
    return (
      <>
        <TopBar title={t('nc.detail')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.patch(`/admin/ncrs/${id}`, body);
      toast.push(message, 'ok');
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
      await api.post(`/admin/ncrs/${id}/notes`, { body: note.trim() });
      setNote('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.add.failed'), 'error');
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
      form.append('owner_type', 'NCR');
      form.append('owner_id', String(id));
      form.append('kind', 'OTHER');
      form.append('visibility', 'SHARED');
      await api.upload('/admin/documents', form);
      setFiles(null);
      toast.push(t('su.doc.uploaded'), 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  // Uygunsuzluğu yalnızca kalite birimi işler; satınalma kaydı görür, değiştiremez.
  const canEdit = !readOnly && can('QUALITY') && !['CLOSED'].includes(data.status);
  const hasResponse = !!(data.root_cause && data.corrective_action);

  return (
    <>
      <TopBar
        title={data.title}
        subtitle={`${data.ncr_no} · ${data.company_name}`}
        actions={
          <>
            <Link className="btn btn-sm" to="/yonetim/uygunsuzluklar">
              {t('nc.back')}
            </Link>
            <Link className="btn btn-sm" to={`/yonetim/tedarikciler/${data.supplier_id}`}>
              {t('nc.open.supplier')}
            </Link>
            {canEdit && data.status === 'OPEN' && (
              <button
                className="btn btn-sm"
                type="button"
                onClick={async () => {
                  try {
                    await api.post(`/admin/ncrs/${id}/resend-link`);
                    toast.push(t('nc.resent'), 'ok');
                    load();
                  } catch (err) {
                    toast.push(err instanceof ApiError ? err.message : t('a.send.failed'), 'error');
                  }
                }}
              >
                {t('nc.resend')}
              </button>
            )}
            {canEdit && data.status === 'SUPPLIER_RESPONDED' && (
              <button className="btn btn-sm" onClick={() => patch({ status: 'UNDER_REVIEW' }, t('nc.reviewing'))} disabled={busy} type="button">
                {t('nc.to.review')}
              </button>
            )}
            {canEdit && hasResponse && (
              <>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => patch({ status: 'REJECTED' }, t('nc.rejected'))}
                  disabled={busy}
                  type="button"
                >
                  {t('nc.reject')}
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => patch({ status: 'CLOSED', effectiveness: effectiveness || undefined }, t('nc.closed'))}
                  disabled={busy}
                  type="button"
                >
                  {t('nc.close')}
                </button>
              </>
            )}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-header">
          <div className="row wrap" style={{ gap: 10 }}>
            <Badge tone={tone(NCR_STATUS, data.status)}>{label(NCR_STATUS, data.status, lang)}</Badge>
            <Badge tone={tone(NCR_SEVERITY, data.severity)}>{label(NCR_SEVERITY, data.severity, lang)}</Badge>
            <Badge tone="neutral">{label(NCR_CATEGORY, data.category, lang)}</Badge>
            {data.is_overdue === 1 && <Badge tone="danger">{t('nc.overdue')}</Badge>}
            <span className="small muted">
              {t('a.due')}: <strong>{formatDate(data.due_date, false, lang)}</strong>
            </span>
            {data.responded_at && (
              <span className="small muted">
                {t('nc.answer')}: <strong>{formatDate(data.responded_at, true, lang)}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            <div className="card">
              <div className="card-title">{t('nc.description')}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{data.description}</div>
              <dl className="kv" style={{ marginTop: 16 }}>
                <dt>{t('nc.part')}</dt>
                <dd>{data.part_no ?? '—'}</dd>
                <dt>{t('nc.affected')}</dt>
                <dd>{data.qty_affected ?? '—'}</dd>
                <dt>{t('nc.detected.date')}</dt>
                <dd>{formatDate(data.detected_at, false, lang)}</dd>
                <dt>{t('nc.opened.by')}</dt>
                <dd>{data.opened_by_name ?? '—'}</dd>
              </dl>
            </div>

            <div className="card">
              <div className="card-title">{t('nc.response')}</div>
              {!hasResponse && !data.containment ? (
                <div className="small muted">
                  {t('nc.no.response')}
                </div>
              ) : (
                <>
                  {[
                    [t('sp.8d.containment'), data.containment],
                    [t('sp.8d.root'), data.root_cause],
                    [t('sp.8d.corrective'), data.corrective_action],
                    [t('sp.8d.preventive'), data.preventive_action],
                  ].map(([title, body]) =>
                    body ? (
                      <div key={title as string} style={{ marginBottom: 14 }}>
                        <div className="small muted" style={{ marginBottom: 4 }}>
                          {title}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{body}</div>
                      </div>
                    ) : null,
                  )}
                </>
              )}

              {canEdit && hasResponse && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>{t('nc.verification')}</label>
                  <textarea
                    rows={3}
                    value={effectiveness}
                    onChange={(e) => setEffectiveness(e.target.value)}
                    placeholder={t('nc.verification.ph')}
                  />
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 8, alignSelf: 'flex-start' }}
                    onClick={() => patch({ effectiveness }, 'Kaydedildi.')}
                    disabled={busy}
                    type="button"
                  >
                    {t('a.save')}
                  </button>
                </div>
              )}
              {data.effectiveness && !canEdit && (
                <div style={{ marginTop: 12 }}>
                  <div className="small muted" style={{ marginBottom: 4 }}>
                    {t('nc.verification')}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>{data.effectiveness}</div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">{t('ad.docs.count')} ({data.documents.length})</div>
              {canEdit && (
                <div style={{ marginBottom: 14 }}>
                  <FileSlot
                    title={t('nc.upload.shared')}
                    meta={t('nc.upload.meta')}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                    multiple
                    file={files}
                    onSelect={setFiles}
                    labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
                  />
                  <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={upload} disabled={!files?.length || busy} type="button">
                    {t('a.upload')}
                  </button>
                </div>
              )}
              {data.documents.map((doc) => (
                <div className={`doc-item ${doc.uploaded_by_supplier ? 'supplier-doc' : ''}`} key={doc.id}>
                  <div style={{ flex: 1 }}>
                    <div className="doc-name">{doc.original_name}</div>
                    <div className="doc-meta">
                      {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at, false, lang)}
                      {doc.uploaded_by_supplier ? ` · ${t('ad.by.supplier')}` : ''}
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

            <div className="card">
              <div className="card-title">{t('a.notes')}</div>
              {/* Uygunsuzluk notu kalite biriminin kaydıdır. */}
              {!readOnly && can('QUALITY') && (
                <div className="stack" style={{ marginBottom: 14 }}>
                  <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ad.note.ph')} />
                  <button className="btn btn-sm" onClick={addNote} disabled={!note.trim() || busy} type="button" style={{ alignSelf: 'flex-start' }}>
                    {t('ad.note.add')}
                  </button>
                </div>
              )}
              {data.notes.map((n) => (
                <div className={`note-item ${n.visibility === 'SHARED' ? 'shared' : ''}`} key={n.id}>
                  {n.body}
                  <div className="meta">
                    {n.author} · {formatDate(n.created_at, true, lang)}
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                        : {label(NCR_STATUS, a.from_value, lang)} → {label(NCR_STATUS, a.to_value, lang)}
                      </>
                    )}
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
    </>
  );
}
