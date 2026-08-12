import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { Loading } from '../../components/ui';
import { useI18n } from '../../i18n';
import { LangToggle, YanmarLogo } from '../public/PublicShell';

type Info = { company_name: string; supplier_code: string; email: string; isReset: boolean };

/**
 * Onay e-postasındaki bağlantıyla açılan parola belirleme ekranı.
 * Tedarikçi kendi parolasını burada oluşturur; sonrasında Business Partner
 * kapısından e-posta + parola ile giriş yapar.
 */
export default function SetPassword() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get<Info>(`/supplier/set-password/${token}`)
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : t('pw.link.error')));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('pw.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/supplier/set-password/${token}`, { password });
      setDone(true);
      setTimeout(() => navigate('/business-partner?giris=tedarikci'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('pw.create.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bp-gate">
      <header className="bp-gate-top">
        <YanmarLogo />
        <LangToggle />
      </header>

      <main className="bp-gate-body" style={{ maxWidth: 520 }}>
        {loadError ? (
          <>
            <h1>{t('pw.link.invalid')}</h1>
            <div className="form-error" style={{ marginTop: 16 }}>{loadError}</div>
            <Link className="btn" to="/business-partner?giris=tedarikci" style={{ marginTop: 16 }}>
              {t('pw.goto.login')}
            </Link>
          </>
        ) : !info ? (
          <Loading />
        ) : done ? (
          <div className="bp-panel" style={{ textAlign: 'center' }}>
            <div className="success-icon" style={{ marginBottom: 14 }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>{t('pw.done.title')}</h2>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              {t('pw.done.body')}
            </p>
            <Link className="btn btn-primary" to="/business-partner?giris=tedarikci" style={{ marginTop: 16 }}>
              {t('pw.done.btn')}
            </Link>
          </div>
        ) : (
          <>
            <h1>{info.isReset ? t('pw.reset.title') : t('pw.create.title')}</h1>
            <p className="bp-gate-lead">{t('pw.lead', { company: info.company_name, code: info.supplier_code })}</p>

            <div className="bp-panel">
              {error && <div className="form-error">{error}</div>}

              <div className="field" style={{ marginBottom: 14 }}>
                <label>{t('pw.email.label')}</label>
                <input value={info.email} disabled />
                <span className="hint">{t('pw.email.hint')}</span>
              </div>

              <form onSubmit={submit} className="stack">
                <div className="field">
                  <label>
                    {t('f.password')} <span className="req">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <span className="hint">{t('pw.rule')}</span>
                </div>
                <div className="field">
                  <label>
                    {t('pw.confirm')} <span className="req">*</span>
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy || password.length < 8}>
                  {busy && <span className="spinner" />}
                  {info.isReset ? t('pw.reset.btn') : t('pw.create.btn')}
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
