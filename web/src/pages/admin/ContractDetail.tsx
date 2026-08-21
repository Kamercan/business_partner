import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, FileSlot, Loading, Modal, useToast } from '../../components/ui';
import { ACTIVITY, CONTRACT_STATUS, CONTRACT_TYPE, formatBytes, formatDate, formatMoney, label, tone } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Contract = {
  id: number;
  contract_no: string;
  supplier_id: number;
  company_name: string;
  supplier_code: string;
  title: string;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  value: number | null;
  renewal_notice_days: number | null;
  auto_renew: number;
  signed_at: string | null;
  owner_name: string | null;
  notes: string | null;
  expiry_flag: number;
  days_remaining: number | null;
  documents: Array<{
    id: number;
    kind: string;
    original_name: string;
    size_bytes: number;
    visibility: string;
    created_at: string;
    uploaded_by_supplier: number;
    uploaded_by_name: string | null;
  }>;
  activity: Array<{
    id: number;
    action: string;
    actor_label: string;
    from_value: string | null;
    to_value: string | null;
    detail: string | null;
    created_at: string;
  }>;
};

export default function ContractDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const toast = useToast();
  const { can, readOnly } = useAuth();

  const [data, setData] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[] | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [edit, setEdit] = useState({
    title: '', type: 'FRAMEWORK', status: 'DRAFT', start_date: '', end_date: '',
    currency: 'EUR', value: '', renewal_notice_days: '60', signed_at: '', auto_renew: false, notes: '',
  });

  /** Sözleşme satınalmanın alanıdır; kalite kaydı görür, değiştiremez. */
  const canEdit = !readOnly && can('MODERATOR');

  const load = useCallback(() => {
    api
      .get<Contract>(`/admin/contracts/${id}`)
      .then((d) => {
        setData(d);
        setEdit({
          title: d.title,
          type: d.type,
          status: d.status,
          start_date: d.start_date ?? '',
          end_date: d.end_date ?? '',
          currency: d.currency ?? 'EUR',
          value: d.value?.toString() ?? '',
          renewal_notice_days: (d.renewal_notice_days ?? 60).toString(),
          signed_at: d.signed_at ?? '',
          auto_renew: d.auto_renew === 1,
          notes: d.notes ?? '',
        });
      })
      .catch((err) => toast.push(err instanceof ApiError ? err.message : t('co.not.found'), 'error'));
  }, [id, toast]);

  useEffect(load, [load]);

  if (!data) {
    return (
      <>
        <TopBar title={t('co.detail')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  async function upload() {
    if (!files?.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      form.append('owner_type', 'CONTRACT');
      form.append('owner_id', String(id));
      form.append('kind', 'CONTRACT_FILE');
      form.append('visibility', 'INTERNAL');
      await api.upload('/admin/documents', form);
      setFiles(null);
      toast.push(t('co.uploaded'), 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  /** Belgeyi tedarikçiye açar veya dahiliye geri çeker. */
  async function toggleShare(docId: number, current: string) {
    try {
      await api.patch(`/admin/documents/${docId}`, { visibility: current === 'SHARED' ? 'INTERNAL' : 'SHARED' });
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.update.failed'), 'error');
    }
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/admin/contracts/${id}`, {
        title: edit.title,
        type: edit.type,
        status: edit.status,
        start_date: edit.start_date || undefined,
        end_date: edit.end_date || undefined,
        currency: edit.currency,
        value: edit.value === '' ? null : Number(edit.value),
        renewal_notice_days: Number(edit.renewal_notice_days),
        signed_at: edit.signed_at || null,
        auto_renew: edit.auto_renew,
        notes: edit.notes || undefined,
      });
      toast.push(t('co.updated'), 'ok');
      setEditModal(false);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.update.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title={data.title}
        subtitle={`${data.contract_no} · ${data.company_name}`}
        actions={
          <>
            <Link className="btn btn-sm" to="/yonetim/sozlesmeler">
              {t('co.back')}
            </Link>
            <Link className="btn btn-sm" to={`/yonetim/tedarikciler/${data.supplier_id}`}>
              {t('nc.open.supplier')}
            </Link>
            {canEdit && (
              <button className="btn btn-sm btn-primary" onClick={() => setEditModal(true)} type="button">
                {t('co.edit')}
              </button>
            )}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-header">
          <div className="row wrap" style={{ gap: 10 }}>
            <Badge tone={tone(CONTRACT_STATUS, data.status)}>{label(CONTRACT_STATUS, data.status, lang)}</Badge>
            <Badge tone="neutral">{label(CONTRACT_TYPE, data.type, lang)}</Badge>
            {data.expiry_flag === 1 && <Badge tone="warn">{t('co.days.left', { n: data.days_remaining ?? 0 })}</Badge>}
            {data.expiry_flag === 2 && <Badge tone="danger">{t('co.expired')}</Badge>}
            <span className="small muted">
              {t('co.value')}: <strong>{formatMoney(data.value, data.currency, lang)}</strong>
            </span>
            <span className="small muted">
              {t('a.owner')}: <strong>{data.owner_name ?? '—'}</strong>
            </span>
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            <div className="card">
              <div className="card-title">{t('co.detail')}</div>
              <dl className="kv">
                <dt>{t('a.supplier')}</dt>
                <dd>
                  <Link to={`/yonetim/tedarikciler/${data.supplier_id}`}>{data.company_name}</Link> ({data.supplier_code})
                </dd>
                <dt>{t('su.contract')}</dt>
                <dd>{data.contract_no}</dd>
                <dt>{t('co.start')}</dt>
                <dd>{formatDate(data.start_date, false, lang)}</dd>
                <dt>{t('co.end')}</dt>
                <dd>{formatDate(data.end_date, false, lang)}</dd>
                <dt>{t('co.signed.at')}</dt>
                <dd>{formatDate(data.signed_at, false, lang)}</dd>
                <dt>{t('co.reminder')}</dt>
                <dd>{t('d.days', { n: data.renewal_notice_days ?? 60 })}</dd>
              </dl>
              {data.notes && (
                <div style={{ marginTop: 14 }}>
                  <div className="small muted" style={{ marginBottom: 4 }}>
                    {t('co.notes')}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{data.notes}</div>
                </div>
              )}
            </div>

            {/* ------------------------- Belgeler ------------------------- */}
            <div className="card">
              <div className="card-title">
                {t('co.docs')} ({data.documents.length})
              </div>
              {canEdit && (
                <div style={{ marginBottom: 14 }}>
                  <FileSlot
                    title={t('co.upload')}
                    meta={t('co.upload.meta')}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                    multiple
                    file={files}
                    onSelect={setFiles}
                    labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
                  />
                  <div className="row" style={{ marginTop: 10, gap: 10 }}>
                    <button className="btn btn-sm btn-primary" onClick={upload} disabled={!files?.length || busy} type="button">
                      {busy && <span className="spinner" />} {t('a.upload')}
                    </button>
                    <span className="small muted">{t('co.upload.hint')}</span>
                  </div>
                </div>
              )}

              {data.documents.length === 0 ? (
                <div className="small muted">{t('co.docs.none')}</div>
              ) : (
                data.documents.map((doc) => (
                  <div className={`doc-item ${doc.visibility === 'SHARED' ? 'supplier-doc' : ''}`} key={doc.id}>
                    <div style={{ flex: 1 }}>
                      <div className="doc-name">{doc.original_name}</div>
                      <div className="doc-meta">
                        {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at, false, lang)}
                        {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                        {doc.visibility === 'SHARED' ? ` · ${t('co.shared')}` : ''}
                      </div>
                    </div>
                    {canEdit && (
                      <button className="btn btn-sm" type="button" onClick={() => toggleShare(doc.id, doc.visibility)}>
                        {doc.visibility === 'SHARED' ? t('co.unshare') : t('co.share')}
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() =>
                        api.download(`/admin/documents/${doc.id}/download`, doc.original_name).catch((e) => toast.push(e.message, 'error'))
                      }
                    >
                      {t('a.download')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">{t('a.history')}</div>
            <div className="timeline">
              {data.activity.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <div className="t-dot" />
                  <div>
                    <div className="t-title">{label(ACTIVITY, a.action, lang)}</div>
                    {a.detail && <div className="t-detail">{a.detail}</div>}
                    {(a.from_value || a.to_value) && (
                      <div className="t-detail">
                        {a.from_value ?? '—'} → {a.to_value ?? '—'}
                      </div>
                    )}
                    <div className="t-meta">
                      {a.actor_label} · {formatDate(a.created_at, true, lang)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------ Düzenleme ------------------------------ */}
      {editModal && (
        <Modal
          title={t('co.edit')}
          onClose={() => setEditModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setEditModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={save} disabled={busy || edit.title.length < 3} type="button">
                  {busy && <span className="spinner" />} {t('a.save')}
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>
                {t('co.title.field')} <span className="req">*</span>
              </label>
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>{t('a.type')}</label>
                <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                  {Object.keys(CONTRACT_TYPE).map((k) => (
                    <option key={k} value={k}>
                      {label(CONTRACT_TYPE, k, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('a.status')}</label>
                <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {Object.keys(CONTRACT_STATUS).map((k) => (
                    <option key={k} value={k}>
                      {label(CONTRACT_STATUS, k, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('co.start')}</label>
                <input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.end')}</label>
                <input type="date" value={edit.end_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.value')}</label>
                <input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.currency')}</label>
                <select value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="TRY">TRY</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
              <div className="field">
                <label>{t('co.signed.at')}</label>
                <input type="date" value={edit.signed_at} onChange={(e) => setEdit({ ...edit, signed_at: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.reminder')}</label>
                <input
                  type="number"
                  value={edit.renewal_notice_days}
                  onChange={(e) => setEdit({ ...edit, renewal_notice_days: e.target.value })}
                />
              </div>
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={edit.auto_renew} onChange={(e) => setEdit({ ...edit, auto_renew: e.target.checked })} />
              {t('co.auto.renew')}
            </label>
            <div className="field">
              <label>{t('co.notes')}</label>
              <textarea rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
