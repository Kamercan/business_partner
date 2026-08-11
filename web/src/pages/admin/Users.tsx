import { useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Loading, Modal, useToast } from '../../components/ui';
import { ROLE, formatDate, label, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type User = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string | null;
  phone: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
};

const EMPTY = { email: '', full_name: '', role: 'MODERATOR', department: '', phone: '', password: '' };

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [rows, setRows] = useState<User[] | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = () => api.get<User[]>('/admin/users/all').then(setRows).catch(() => setRows([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    try {
      await api.post('/admin/users', {
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        department: form.department || undefined,
        phone: form.phone || undefined,
        password: form.password,
      });
      toast.push('Kullanıcı oluşturuldu.', 'ok');
      setModal(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Oluşturulamadı.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>, message: string) {
    try {
      await api.patch(`/admin/users/${id}`, body);
      toast.push(message, 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Güncellenemedi.', 'error');
    }
  }

  return (
    <>
      <TopBar
        title="Kullanıcılar"
        subtitle="Panel erişimi olan ekip üyeleri ve rolleri"
        actions={
          <button className="btn btn-primary" onClick={() => setModal(true)} type="button">
            + Yeni kullanıcı
          </button>
        }
      />

      <div className="admin-content">
        <div className="table-wrap">
          {!rows ? (
            <Loading />
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ad Soyad</th>
                    <th>E-posta</th>
                    <th>Rol</th>
                    <th>Birim</th>
                    <th>Son giriş</th>
                    <th>Durum</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td className="company">
                        {u.full_name}
                        {u.id === me?.id && <span className="small muted"> (siz)</span>}
                      </td>
                      <td className="small">{u.email}</td>
                      <td>
                        <select
                          className="input"
                          style={{ width: 190, padding: '5px 8px', fontSize: 12 }}
                          value={u.role}
                          disabled={u.id === me?.id}
                          onChange={(e) => patch(u.id, { role: e.target.value }, 'Rol güncellendi.')}
                        >
                          {Object.keys(ROLE).map((r) => (
                            <option key={r} value={r}>
                              {label(ROLE, r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="small">{u.department ?? '—'}</td>
                      <td className="tight small">{formatDate(u.last_login_at, true)}</td>
                      <td className="tight">
                        <Badge tone={u.is_active ? 'ok' : 'neutral'}>{u.is_active ? 'Aktif' : 'Pasif'}</Badge>
                      </td>
                      <td className="tight">
                        <div className="row">
                          <button className="btn btn-sm" type="button" onClick={() => setResetFor(u)}>
                            Şifre
                          </button>
                          {u.id !== me?.id && (
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => patch(u.id, { is_active: !u.is_active }, u.is_active ? 'Kullanıcı pasifleştirildi.' : 'Kullanıcı aktifleştirildi.')}
                            >
                              {u.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal
          title="Yeni kullanıcı"
          size="sm"
          onClose={() => setModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setModal(false)} type="button">
                  Vazgeç
                </button>
                <button
                  className="btn btn-primary"
                  onClick={create}
                  disabled={busy || !form.email || form.full_name.length < 2 || form.password.length < 8}
                  type="button"
                >
                  {busy && <span className="spinner" />} Oluştur
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>
                Ad Soyad <span className="req">*</span>
              </label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="field">
              <label>
                E-posta <span className="req">*</span>
              </label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Rol</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {Object.keys(ROLE).map((r) => (
                    <option key={r} value={r}>
                      {label(ROLE, r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Birim</label>
                <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>
                Geçici şifre <span className="req">*</span>
              </label>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <span className="hint">En az 8 karakter, harf ve rakam içermeli.</span>
            </div>
          </div>
        </Modal>
      )}

      {resetFor && (
        <Modal
          title={`Şifre sıfırla — ${resetFor.full_name}`}
          size="sm"
          onClose={() => {
            setResetFor(null);
            setNewPassword('');
          }}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setResetFor(null)} type="button">
                  Vazgeç
                </button>
                <button
                  className="btn btn-primary"
                  disabled={newPassword.length < 8}
                  onClick={async () => {
                    await patch(resetFor.id, { password: newPassword }, 'Şifre güncellendi.');
                    setResetFor(null);
                    setNewPassword('');
                  }}
                  type="button"
                >
                  Kaydet
                </button>
              </div>
            </>
          }
        >
          <div className="field">
            <label>Yeni şifre</label>
            <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <span className="hint">En az 8 karakter, harf ve rakam içermeli.</span>
          </div>
        </Modal>
      )}
    </>
  );
}
