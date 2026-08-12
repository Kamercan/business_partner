import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Loading } from '../../components/ui';
import { useI18n } from '../../i18n';
import { APPLICATION_STATUS, formatDate, label, tone } from '../../lib/labels';
import { supplierToken, type SupplierSession } from '../../auth/supplierSession';
import ApplicationForm, { type Meta } from './ApplicationForm';
import { LangToggle, YanmarLogo } from './PublicShell';

type Side = 'supplier' | 'approved' | 'team';

/** Demo modunda portal girişini denemek için hazır onaylı tedarikçi hesabı. */
type DemoSupplier = { company_name: string; email: string; password: string };

type TrackResult = {
  ref_no: string;
  company_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  audit: { status: string; planned_date: string | null; completed_at: string | null } | null;
  messages: Array<{ body: string; created_at: string }>;
};

const STEPS = [
  { tr: 'Başvuru alındı', en: 'Application received' },
  { tr: 'Ön değerlendirme', en: 'Pre-evaluation' },
  { tr: 'Kalite denetimi', en: 'Quality audit' },
  { tr: 'Onaylı tedarikçi', en: 'Approved supplier' },
];

function stepIndexFor(status: string): number {
  if (status === 'NEW') return 0;
  if (['IN_REVIEW', 'NEEDS_INFO', 'ON_HOLD'].includes(status)) return 1;
  if (['AUDIT_PENDING', 'AUDIT_PLANNED', 'AUDIT_IN_PROGRESS', 'AUDIT_DONE'].includes(status)) return 2;
  if (status === 'APPROVED') return 3;
  return 1;
}

/**
 * Business Partner tek giriş kapısı.
 *
 * Sitedeki "Business Partner" butonu buraya gelir. Tedarikçi de Yanmar ekibi de
 * aynı ekrandan devam eder: tedarikçi başvurusunu yapar veya takip eder,
 * ekip panele giriş yapar. Ayrı ayrı adresler ezberlenmez.
 */
export default function BusinessPartner() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { login, user, loading } = useAuth();
  const [params, setParams] = useSearchParams();

  const [side, setSide] = useState<Side>(
    params.get('giris') === 'ekip' ? 'team' : params.get('giris') === 'tedarikci' ? 'approved' : 'supplier',
  );
  const [meta, setMeta] = useState<Meta | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Tedarikçi: başvuru takibi
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [trackEmail, setTrackEmail] = useState(params.get('email') ?? '');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);

  // Onaylı tedarikçi girişi
  const [spEmail, setSpEmail] = useState('');
  const [spPassword, setSpPassword] = useState('');
  const [spError, setSpError] = useState<string | null>(null);
  const [spBusy, setSpBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState<string | null>(null);

  // Ekip: giriş
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoSuppliers, setDemoSuppliers] = useState<DemoSupplier[]>([]);

  useEffect(() => {
    api
      .get<Meta & { demoMode?: boolean; demoSuppliers?: DemoSupplier[] }>('/meta')
      .then((m) => {
        setMeta(m);
        setDemoMode(!!m.demoMode);
        setDemoSuppliers(m.demoSuppliers ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function track(refNo: string, mail: string) {
    if (!refNo.trim() || !mail.trim()) return;
    setTrackBusy(true);
    setTrackError(null);
    setResult(null);
    try {
      setResult(await api.post<TrackResult>('/portal/track', { ref_no: refNo.trim(), email: mail.trim() }));
    } catch (err) {
      setTrackError(err instanceof ApiError ? err.message : t('track.notfound'));
    } finally {
      setTrackBusy(false);
    }
  }

  // E-postadaki takip bağlantısıyla gelindiyse doğrudan sorgula
  useEffect(() => {
    const r = params.get('ref');
    const e = params.get('email');
    if (r && e) void track(r, e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function supplierLogin(e: React.FormEvent) {
    e.preventDefault();
    setSpBusy(true);
    setSpError(null);
    try {
      const data = await api.post<{ token: string; supplier: SupplierSession }>('/supplier/login', {
        email: spEmail,
        password: spPassword,
      });
      supplierToken.set(data.token);
      navigate('/tedarikci');
    } catch (err) {
      setSpError(err instanceof ApiError ? err.message : 'Giriş yapılamadı.');
    } finally {
      setSpBusy(false);
    }
  }

  async function supplierForgot() {
    if (!spEmail.trim()) {
      setSpError('Önce e-posta adresinizi yazın.');
      return;
    }
    setSpBusy(true);
    setSpError(null);
    try {
      const res = await api.post<{ message: string }>('/supplier/forgot-password', { email: spEmail.trim() });
      setForgotSent(res.message);
    } catch (err) {
      setSpError(err instanceof ApiError ? err.message : 'İşlem başarısız.');
    } finally {
      setSpBusy(false);
    }
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      await login(email, password);
      navigate('/yonetim');
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Giriş yapılamadı.');
    } finally {
      setLoginBusy(false);
    }
  }

  if (loading) return <Loading />;
  // Girişli kullanıcı doğrudan panele gider — ancak e-postadaki takip
  // bağlantısıyla gelindiyse (ref parametresi var) takip ekranı gösterilir.
  if (user && !params.get('ref')) return <Navigate to="/yonetim" replace />;

  const rejected = result && ['REJECTED', 'DISQUALIFIED'].includes(result.status);
  const activeStep = result ? stepIndexFor(result.status) : 0;

  const pick = (side_: Side) => {
    setSide(side_);
    const next = new URLSearchParams(params);
    if (side_ === 'team') next.set('giris', 'ekip');
    else if (side_ === 'approved') next.set('giris', 'tedarikci');
    else next.delete('giris');
    setParams(next, { replace: true });
  };

  return (
    <div className="bp-gate">
      <header className="bp-gate-top">
        <YanmarLogo />
        <LangToggle />
      </header>

      <main className="bp-gate-body">
        <h1>{lang === 'tr' ? 'Business Partner Portalı' : 'Business Partner Portal'}</h1>
        <p className="bp-gate-lead">
          {lang === 'tr'
            ? 'Tedarikçi başvuruları ve değerlendirme süreçleri için tek giriş noktası.'
            : 'Single entry point for supplier applications and evaluation processes.'}
        </p>

        <div className="bp-choice bp-choice-3">
          <button type="button" className={`bp-choice-card ${side === 'supplier' ? 'on' : ''}`} onClick={() => pick('supplier')}>
            <span className="bp-choice-title">{lang === 'tr' ? 'Başvuru yapmak istiyorum' : 'I want to apply'}</span>
            <span className="bp-choice-sub">
              {lang === 'tr' ? 'Yeni başvuru veya başvuru takibi' : 'New application or track an existing one'}
            </span>
          </button>
          <button type="button" className={`bp-choice-card ${side === 'approved' ? 'on' : ''}`} onClick={() => pick('approved')}>
            <span className="bp-choice-title">{lang === 'tr' ? 'Onaylı tedarikçiyim' : "I'm an approved supplier"}</span>
            <span className="bp-choice-sub">
              {lang === 'tr' ? 'Portala girin: belge, uygunsuzluk, sözleşme' : 'Sign in: documents, NCRs, contracts'}
            </span>
          </button>
          <button type="button" className={`bp-choice-card ${side === 'team' ? 'on' : ''}`} onClick={() => pick('team')}>
            <span className="bp-choice-title">{lang === 'tr' ? 'Yanmar ekibiyim' : "I'm from the Yanmar team"}</span>
            <span className="bp-choice-sub">{lang === 'tr' ? 'Yönetim paneline giriş yapın' : 'Sign in to the admin panel'}</span>
          </button>
        </div>

        {/* ----------------------------- Tedarikçi ----------------------------- */}
        {side === 'supplier' && (
          <div className="bp-panel">
            <div className="bp-action">
              <div>
                <h2>{lang === 'tr' ? 'Yeni başvuru' : 'New application'}</h2>
                <p>
                  {lang === 'tr'
                    ? 'Firma bilgileriniz, üretim yetkinlikleriniz ve kalite belgelerinizle tedarikçi havuzumuza başvurun. Yaklaşık 5 dakika sürer.'
                    : 'Apply to our supplier pool with your company details, capabilities and quality certificates. Takes about 5 minutes.'}
                </p>
              </div>
              <button className="btn btn-primary" type="button" onClick={() => setFormOpen(true)} disabled={!meta}>
                {lang === 'tr' ? 'Başvuru formunu aç' : 'Open application form'}
              </button>
            </div>

            <div className="bp-sep">{lang === 'tr' ? 'veya' : 'or'}</div>

            <div className="bp-action bp-action-col">
              <div>
                <h2>{lang === 'tr' ? 'Başvurumu takip et' : 'Track my application'}</h2>
                <p>
                  {lang === 'tr'
                    ? 'Daha önce başvurduysanız referans numaranız ve e-posta adresinizle durumunuzu görebilirsiniz.'
                    : 'If you applied before, check your status with your reference number and email.'}
                </p>
              </div>

              <form
                className="bp-track-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void track(ref, trackEmail);
                }}
              >
                <div className="field">
                  <label>{t('track.ref')}</label>
                  <input className="mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="YTM-BP-2026-00001" />
                </div>
                <div className="field">
                  <label>{t('f.email')}</label>
                  <input type="email" value={trackEmail} onChange={(e) => setTrackEmail(e.target.value)} placeholder={t('f.email.ph')} />
                </div>
                <button className="btn" type="submit" disabled={trackBusy}>
                  {trackBusy && <span className="spinner" />}
                  {t('btn.query')}
                </button>
              </form>

              {trackError && <div className="form-error" style={{ marginTop: 12 }}>{trackError}</div>}

              {result && (
                <div className="bp-track-result">
                  <div className="row-between wrap" style={{ marginBottom: 16 }}>
                    <div>
                      <div className="small muted mono">{result.ref_no}</div>
                      <strong style={{ fontSize: 16 }}>{result.company_name}</strong>
                    </div>
                    <Badge tone={tone(APPLICATION_STATUS, result.status)}>{label(APPLICATION_STATUS, result.status, lang)}</Badge>
                  </div>

                  <div className="status-timeline">
                    {STEPS.map((step, i) => {
                      const state = rejected && i >= activeStep ? 'rejected' : i < activeStep ? 'done' : i === activeStep ? 'current' : '';
                      return (
                        <div className={`status-step ${state}`} key={step.tr}>
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

                  <div className="row wrap small muted" style={{ marginTop: 16, gap: 20 }}>
                    <span>
                      {t('track.submitted')}: <strong>{formatDate(result.created_at)}</strong>
                    </span>
                    <span>
                      {t('track.updated')}: <strong>{formatDate(result.updated_at, true)}</strong>
                    </span>
                  </div>

                  {result.messages.length > 0 && (
                    <>
                      <div className="section-label" style={{ marginTop: 20 }}>
                        {t('track.messages')}
                      </div>
                      {result.messages.map((m, i) => (
                        <div className="message-item" key={i}>
                          {m.body}
                          <time>{formatDate(m.created_at, true)}</time>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------ Onaylı tedarikçi girişi ---------------------- */}
        {side === 'approved' && (
          <div className="bp-panel">
            <div className="bp-login">
              <h2>{lang === 'tr' ? 'Onaylı tedarikçi girişi' : 'Approved supplier sign-in'}</h2>
              <p>
                {lang === 'tr'
                  ? 'Denetimden geçip onaylanan tedarikçilerimiz içindir. Parolanızı, onay e-postasındaki bağlantıdan kendiniz belirlersiniz.'
                  : 'For suppliers who passed the audit. You set your own password via the link in the approval email.'}
              </p>

              {spError && <div className="form-error" style={{ marginTop: 14 }}>{spError}</div>}
              {forgotSent && (
                <div className="badge badge-ok" style={{ marginTop: 14, display: 'block', padding: '10px 12px', lineHeight: 1.5 }}>
                  {forgotSent}
                </div>
              )}

              <form onSubmit={supplierLogin} className="stack" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>{t('f.email')}</label>
                  <input type="email" value={spEmail} onChange={(e) => setSpEmail(e.target.value)} autoComplete="username" required />
                </div>
                <div className="field">
                  <label>{lang === 'tr' ? 'Parola' : 'Password'}</label>
                  <input
                    type="password"
                    value={spPassword}
                    onChange={(e) => setSpPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={spBusy}>
                  {spBusy && <span className="spinner" />}
                  {lang === 'tr' ? 'Giriş yap' : 'Sign in'}
                </button>
              </form>

              <button
                type="button"
                className="bp-link-btn"
                onClick={supplierForgot}
                disabled={spBusy}
              >
                {lang === 'tr' ? 'Parolamı unuttum / henüz oluşturmadım' : 'Forgot password / not set yet'}
              </button>

              {demoMode && demoSuppliers.length > 0 && (
                <div className="demo-accounts">
                  <strong>{lang === 'tr' ? 'Demo tedarikçi hesapları' : 'Demo supplier accounts'}</strong>
                  {lang === 'tr' ? ' — satıra tıklayın, alanlar dolsun' : ' — click a row to fill the fields'}
                  <div className="demo-list">
                    {demoSuppliers.map((d) => (
                      <button
                        key={d.email}
                        type="button"
                        className="demo-row"
                        onClick={() => {
                          setSpEmail(d.email);
                          setSpPassword(d.password);
                          setSpError(null);
                        }}
                      >
                        <span className="demo-role">{d.company_name}</span>
                        <span className="demo-cred">
                          {d.email} <span className="demo-sep">/</span> {d.password}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="demo-note">
                    {lang === 'tr'
                      ? 'Bu hesaplar yalnızca demo verisi içindir. Gerçek tedarikçiler parolalarını onay e-postasındaki bağlantıdan kendileri belirler; parolasını değiştiren tedarikçi bu listede görünmez.'
                      : 'These accounts exist only in demo data. Real suppliers set their own password from the approval email; a supplier who changes it disappears from this list.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------- Ekip -------------------------------- */}
        {side === 'team' && (
          <div className="bp-panel">
            <div className="bp-login">
              <h2>{lang === 'tr' ? 'Yönetim paneli girişi' : 'Admin panel sign-in'}</h2>
              <p>
                {lang === 'tr'
                  ? 'Satınalma ve Kalite ekipleri için. Tedarikçilerin giriş yapmasına gerek yoktur.'
                  : 'For the Procurement and Quality teams. Suppliers do not need an account.'}
              </p>

              {loginError && <div className="form-error">{loginError}</div>}

              <form onSubmit={submitLogin} className="stack" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>{t('f.email')}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                </div>
                <div className="field">
                  <label>{lang === 'tr' ? 'Şifre' : 'Password'}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={loginBusy}>
                  {loginBusy && <span className="spinner" />}
                  {lang === 'tr' ? 'Giriş yap' : 'Sign in'}
                </button>
              </form>

              {demoMode && (
                <div className="demo-accounts">
                  <strong>Demo hesapları</strong> — satıra tıklayın, alanlar dolsun
                  <div className="demo-list">
                    {[
                      { role: 'Satınalma / Moderatör', email: 'satinalma@yanmar.com.tr', password: 'Moderator123!' },
                      { role: 'Kalite Birimi', email: 'kalite@yanmar.com.tr', password: 'Kalite123!' },
                      { role: 'İzleyici (salt okunur)', email: 'izleme@yanmar.com.tr', password: 'Viewer123!' },
                    ].map((d) => (
                      <button
                        key={d.email}
                        type="button"
                        className="demo-row"
                        onClick={() => {
                          setEmail(d.email);
                          setPassword(d.password);
                          setLoginError(null);
                        }}
                      >
                        <span className="demo-role">{d.role}</span>
                        <span className="demo-cred">
                          {d.email} <span className="demo-sep">/</span> {d.password}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {formOpen && meta && <ApplicationForm meta={meta} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
