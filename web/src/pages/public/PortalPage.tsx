import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { Badge, FileSlot, Loading, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { NCR_SEVERITY, NCR_STATUS, formatBytes, formatDate, label, tone } from '../../lib/labels';
import { PublicShell } from './PublicShell';

type PortalData = {
  purpose: string;
  entity: 'APPLICATION' | 'NCR' | 'SUPPLIER';
  application?: { ref_no: string; company_name: string; status: string; created_at: string };
  ncr?: {
    id: number; ncr_no: string; title: string; category: string; severity: string; description: string;
    part_no: string | null; qty_affected: number | null; detected_at: string | null; due_date: string | null;
    status: string; company_name: string; containment: string | null; root_cause: string | null;
    corrective_action: string | null; preventive_action: string | null; responded_at: string | null;
  };
  supplier?: { supplier_code: string; company_name: string; grade: string | null; status: string };
  requests?: Array<{ body: string; created_at: string }>;
  documents: Array<{ id: number; original_name: string; size_bytes: number; created_at: string; uploaded_by_supplier: number }>;
};

/**
 * Tedarikçinin hesap açmadan, e-postayla gelen süreli bağlantı üzerinden
 * belge yüklediği ve uygunsuzluk cevabı girdiği ekran (Faz 4).
 */
export default function PortalPage() {
  const { token = '' } = useParams();
  const { t, lang } = useI18n();
  const toast = useToast();

  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ncrForm, setNcrForm] = useState({ containment: '', root_cause: '', corrective_action: '', preventive_action: '' });
  const [sent, setSent] = useState(false);

  const load = () =>
    api
      .get<PortalData>(`/portal/${token}`)
      .then((d) => {
        setData(d);
        if (d.ncr) {
          setNcrForm({
            containment: d.ncr.containment ?? '',
            root_cause: d.ncr.root_cause ?? '',
            corrective_action: d.ncr.corrective_action ?? '',
            preventive_action: d.ncr.preventive_action ?? '',
          });
          setSent(d.ncr.status !== 'OPEN');
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('portal.expired')));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function uploadFiles() {
    if (!files?.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      await api.upload(`/portal/${token}/documents`, form);
      toast.push(t('portal.toast.uploaded'), 'ok');
      setFiles(null);
      await load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('sp.toast.upload.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api.post(`/portal/${token}/messages`, { body: message.trim() });
      toast.push(t('portal.toast.message'), 'ok');
      setMessage('');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('sp.toast.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitNcr() {
    setBusy(true);
    try {
      await api.post(`/portal/${token}/ncr-response`, ncrForm);
      toast.push(t('portal.sent'), 'ok');
      setSent(true);
      await load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('sp.toast.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <PublicShell>
        <div className="public-page">
          <div className="form-error">{error}</div>
        </div>
      </PublicShell>
    );
  }
  if (!data) {
    return (
      <PublicShell>
        <div className="public-page">
          <Loading />
        </div>
      </PublicShell>
    );
  }

  const company = data.ncr?.company_name ?? data.application?.company_name ?? data.supplier?.company_name ?? '';

  return (
    <PublicShell>
      <div className="public-page">
        <h1>{t('portal.title')}</h1>
        <p className="lead">{company}</p>

        {/* --- Uygunsuzluk cevabı --- */}
        {data.ncr && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="row-between" style={{ marginBottom: 14 }}>
              <div>
                <div className="small muted mono">{data.ncr.ncr_no}</div>
                <h2 style={{ fontSize: 18, marginTop: 2 }}>{data.ncr.title}</h2>
              </div>
              <div className="row">
                <Badge tone={tone(NCR_SEVERITY, data.ncr.severity)}>{label(NCR_SEVERITY, data.ncr.severity, lang)}</Badge>
                <Badge tone={tone(NCR_STATUS, data.ncr.status)}>{label(NCR_STATUS, data.ncr.status, lang)}</Badge>
              </div>
            </div>

            <div className="message-item">{data.ncr.description}</div>

            <div className="row wrap small muted" style={{ gap: 18, marginBottom: 18 }}>
              {data.ncr.part_no && <span>{t('portal.part')}: <strong>{data.ncr.part_no}</strong></span>}
              {data.ncr.qty_affected !== null && <span>{t('portal.qty')}: <strong>{data.ncr.qty_affected}</strong></span>}
              {data.ncr.due_date && <span>{t('portal.due')}: <strong>{formatDate(data.ncr.due_date, false, lang)}</strong></span>}
            </div>

            <div className="section-label">{t('portal.ncr.title')}</div>
            <div className="stack">
              <div className="field">
                <label>{t('portal.ncr.containment')}</label>
                <textarea
                  value={ncrForm.containment}
                  disabled={sent}
                  onChange={(e) => setNcrForm({ ...ncrForm, containment: e.target.value })}
                  placeholder={t('sp.8d.containment.ph')}
                />
              </div>
              <div className="field">
                <label>
                  {t('portal.ncr.root')} <span className="req">*</span>
                </label>
                <textarea
                  value={ncrForm.root_cause}
                  disabled={sent}
                  onChange={(e) => setNcrForm({ ...ncrForm, root_cause: e.target.value })}
                  placeholder={t('sp.8d.root.ph')}
                />
              </div>
              <div className="field">
                <label>
                  {t('portal.ncr.corrective')} <span className="req">*</span>
                </label>
                <textarea
                  value={ncrForm.corrective_action}
                  disabled={sent}
                  onChange={(e) => setNcrForm({ ...ncrForm, corrective_action: e.target.value })}
                  placeholder={t('sp.8d.corrective.ph')}
                />
              </div>
              <div className="field">
                <label>{t('portal.ncr.preventive')}</label>
                <textarea
                  value={ncrForm.preventive_action}
                  disabled={sent}
                  onChange={(e) => setNcrForm({ ...ncrForm, preventive_action: e.target.value })}
                  placeholder={t('sp.8d.preventive.ph')}
                />
              </div>

              {sent ? (
                <div className="badge badge-ok" style={{ alignSelf: 'flex-start' }}>
                  ✓ {t('portal.sent')}
                </div>
              ) : (
                <button className="btn btn-primary" onClick={submitNcr} disabled={busy} type="button" style={{ alignSelf: 'flex-start' }}>
                  {busy && <span className="spinner" />}
                  {t('portal.ncr.submit')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- Başvuru bilgi talebi --- */}
        {data.application && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div>
                <div className="small muted mono">{data.application.ref_no}</div>
                <h2 style={{ fontSize: 18, marginTop: 2 }}>{data.application.company_name}</h2>
              </div>
            </div>
            {data.requests?.map((r, i) => (
              <div className="message-item" key={i}>
                {r.body}
                <time>{formatDate(r.created_at, true, lang)}</time>
              </div>
            ))}
          </div>
        )}

        {/* --- Belge yükleme --- */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">{t('portal.upload')}</div>
          <FileSlot
            title={t('portal.docs')}
            meta={t('up.hint')}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
            multiple
            file={files}
            onSelect={setFiles}
            labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
          />
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={uploadFiles} disabled={!files?.length || busy} type="button">
            {busy && <span className="spinner" />}
            {t('btn.upload')}
          </button>

          {data.documents.length > 0 && (
            <ul style={{ listStyle: 'none', marginTop: 16, display: 'grid', gap: 8 }}>
              {data.documents.map((d) => (
                <li key={d.id} className="row-between small" style={{ padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>
                  <span>{d.original_name}</span>
                  <span className="muted">
                    {formatBytes(d.size_bytes)} · {formatDate(d.created_at, false, lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --- Mesaj --- */}
        <div className="card">
          <div className="card-title">{t('portal.message')}</div>
          <div className="field">
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('portal.message.ph')} />
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={sendMessage} disabled={!message.trim() || busy} type="button">
            {t('btn.send')}
          </button>
        </div>
      </div>
    </PublicShell>
  );
}
