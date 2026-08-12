import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { Loading } from '../../components/ui';
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
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Bağlantı doğrulanamadı.'));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Parolalar eşleşmiyor.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/supplier/set-password/${token}`, { password });
      setDone(true);
      setTimeout(() => navigate('/business-partner?giris=tedarikci'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Parola oluşturulamadı.');
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
            <h1>Bağlantı geçersiz</h1>
            <div className="form-error" style={{ marginTop: 16 }}>{loadError}</div>
            <Link className="btn" to="/business-partner?giris=tedarikci" style={{ marginTop: 16 }}>
              Giriş ekranına git
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
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>Parolanız oluşturuldu</h2>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              Giriş ekranına yönlendiriliyorsunuz...
            </p>
            <Link className="btn btn-primary" to="/business-partner?giris=tedarikci" style={{ marginTop: 16 }}>
              Şimdi giriş yap
            </Link>
          </div>
        ) : (
          <>
            <h1>{info.isReset ? 'Parolanızı yenileyin' : 'Portal parolanızı oluşturun'}</h1>
            <p className="bp-gate-lead">
              {info.company_name} ({info.supplier_code}) için tedarikçi portalı erişimi.
            </p>

            <div className="bp-panel">
              {error && <div className="form-error">{error}</div>}

              <div className="field" style={{ marginBottom: 14 }}>
                <label>Giriş e-postanız</label>
                <input value={info.email} disabled />
                <span className="hint">Portala bu adresle gireceksiniz.</span>
              </div>

              <form onSubmit={submit} className="stack">
                <div className="field">
                  <label>
                    Parola <span className="req">*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <span className="hint">En az 8 karakter, harf ve rakam içermeli.</span>
                </div>
                <div className="field">
                  <label>
                    Parola (tekrar) <span className="req">*</span>
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
                  {info.isReset ? 'Parolamı yenile' : 'Parolamı oluştur'}
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
