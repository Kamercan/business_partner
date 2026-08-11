import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { Badge } from '../../components/ui';
import { useI18n } from '../../i18n';
import { APPLICATION_STATUS, formatDate, label, tone } from '../../lib/labels';
import { PublicShell } from './PublicShell';

type TrackResult = {
  ref_no: string;
  company_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  audit: { status: string; planned_date: string | null; completed_at: string | null } | null;
  messages: Array<{ body: string; created_at: string }>;
};

/** Tedarikçiye gösterilen sadeleştirilmiş süreç adımları. */
const STEPS = [
  { key: 'received', tr: 'Başvuru alındı', en: 'Application received' },
  { key: 'review', tr: 'Ön değerlendirme', en: 'Pre-evaluation' },
  { key: 'audit', tr: 'Kalite denetimi', en: 'Quality audit' },
  { key: 'approved', tr: 'Onaylı tedarikçi', en: 'Approved supplier' },
];

function stepIndexFor(status: string): number {
  if (['NEW'].includes(status)) return 0;
  if (['IN_REVIEW', 'NEEDS_INFO', 'ON_HOLD'].includes(status)) return 1;
  if (['AUDIT_PENDING', 'AUDIT_PLANNED', 'AUDIT_IN_PROGRESS', 'AUDIT_DONE'].includes(status)) return 2;
  if (status === 'APPROVED') return 3;
  return 1;
}

export default function TrackPage() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function query(refNo: string, mail: string) {
    if (!refNo.trim() || !mail.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<TrackResult>('/portal/track', { ref_no: refNo.trim(), email: mail.trim() });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('track.notfound'));
    } finally {
      setLoading(false);
    }
  }

  // URL'de referans varsa (e-postadaki bağlantı) otomatik sorgula
  useEffect(() => {
    const r = params.get('ref');
    const e = params.get('email');
    if (r && e) void query(r, e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rejected = result && ['REJECTED', 'DISQUALIFIED'].includes(result.status);
  const activeStep = result ? stepIndexFor(result.status) : 0;

  return (
    <PublicShell>
      <div className="public-page">
        <h1>{t('track.title')}</h1>
        <p className="lead">{t('track.subtitle')}</p>

        <div className="card" style={{ marginBottom: 24 }}>
          <form
            className="grid-2"
            onSubmit={(e) => {
              e.preventDefault();
              setParams({ ref, email });
              void query(ref, email);
            }}
          >
            <div className="field">
              <label>{t('track.ref')}</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="YTM-BP-2026-00001" className="mono" />
            </div>
            <div className="field">
              <label>{t('f.email')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('f.email.ph')} />
            </div>
            <div className="span-2">
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading && <span className="spinner" />}
                {t('btn.query')}
              </button>
            </div>
          </form>
        </div>

        {error && <div className="form-error">{error}</div>}

        {result && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="row-between" style={{ marginBottom: 18 }}>
                <div>
                  <div className="small muted">{result.ref_no}</div>
                  <h2 style={{ fontSize: 19, marginTop: 2 }}>{result.company_name}</h2>
                </div>
                <Badge tone={tone(APPLICATION_STATUS, result.status)}>{label(APPLICATION_STATUS, result.status, lang)}</Badge>
              </div>

              <div className="status-timeline">
                {STEPS.map((step, i) => {
                  const state = rejected && i >= activeStep ? 'rejected' : i < activeStep ? 'done' : i === activeStep ? 'current' : '';
                  return (
                    <div className={`status-step ${state}`} key={step.key}>
                      <div className="status-dot">{i < activeStep ? '✓' : i + 1}</div>
                      <div>
                        <h4>{lang === 'tr' ? step.tr : step.en}</h4>
                        {i === activeStep && (
                          <p>
                            {label(APPLICATION_STATUS, result.status, lang)}
                            {result.audit?.planned_date && i === 2 && ` · ${formatDate(result.audit.planned_date)}`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="row wrap small muted" style={{ marginTop: 18, gap: 20 }}>
                <span>
                  {t('track.submitted')}: <strong>{formatDate(result.created_at)}</strong>
                </span>
                <span>
                  {t('track.updated')}: <strong>{formatDate(result.updated_at, true)}</strong>
                </span>
              </div>
            </div>

            {result.messages.length > 0 && (
              <div className="card">
                <div className="card-title">{t('track.messages')}</div>
                {result.messages.map((m, i) => (
                  <div className="message-item" key={i}>
                    {m.body}
                    <time>{formatDate(m.created_at, true)}</time>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PublicShell>
  );
}
