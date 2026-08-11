import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Loading } from '../../components/ui';
import { YanmarLogo } from '../public/PublicShell';

const DEMO = [
  { role: 'Satınalma / Moderatör', email: 'satinalma@yanmar.com.tr', password: 'Moderator123!' },
  { role: 'Kalite Birimi', email: 'kalite@yanmar.com.tr', password: 'Kalite123!' },
  { role: 'Yönetici', email: 'admin@yanmar.com.tr', password: 'Admin123!' },
];

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (user) return <Navigate to="/yonetim" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/yonetim');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <h2>Tedarikçi başvurularınız tek bir havuzda</h2>
        <p>
          E-posta, LinkedIn, EYDEP ve TurkishExporter üzerinden gelen başvuruları tek merkezde toplayın; ürün grubuna göre
          filtreleyin, Excel'e aktarın ve kalite onay süreçlerini uçtan uca yönetin.
        </p>
        <ul>
          <li>▸ Ürün grubu, sertifika ve ülke bazlı filtreleme</li>
          <li>▸ Tek tıkla Excel dışa aktarım</li>
          <li>▸ Kalite denetimi ve A/B/C/D notlandırma</li>
          <li>▸ Sözleşme, uygunsuzluk ve dosya paylaşımı</li>
        </ul>
      </div>

      <div className="login-form-wrap">
        <div className="login-card">
          <div style={{ marginBottom: 22 }}>
            <YanmarLogo />
          </div>
          <h1>Yönetim Paneli</h1>
          <p className="lead">Devam etmek için kurumsal hesabınızla giriş yapın.</p>

          {error && <div className="form-error">{error}</div>}

          <form onSubmit={submit} className="stack">
            <div className="field">
              <label>E-posta</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </div>
            <div className="field">
              <label>Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy && <span className="spinner" />}
              Giriş yap
            </button>
          </form>

          <div className="demo-accounts">
            <strong>Demo hesapları</strong>
            <br />
            {DEMO.map((d) => (
              <div key={d.email}>
                {d.role}:{' '}
                <button
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                >
                  {d.email}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
