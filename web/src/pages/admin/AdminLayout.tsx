import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { ROLE, label } from '../../lib/labels';

type Counts = { tasks: number; audits: number; ncrs: number; applications: number };

const NAV = [
  { to: '/yonetim', end: true, label: 'Panom', key: null },
  { to: '/yonetim/gorevler', label: 'İş Sıram', key: 'tasks' as const },
  { to: '/yonetim/basvurular', label: 'Başvurular', key: 'applications' as const },
  { to: '/yonetim/denetimler', label: 'Denetimler', key: 'audits' as const },
  { to: '/yonetim/tedarikciler', label: 'Tedarikçiler', key: null },
  { to: '/yonetim/sozlesmeler', label: 'Sözleşmeler', key: null },
  { to: '/yonetim/uygunsuzluklar', label: 'Uygunsuzluklar', key: 'ncrs' as const },

  { group: 'Sistem' },
  { to: '/yonetim/bildirimler', label: 'E-posta Kutusu', key: null },
  { to: '/yonetim/kullanicilar', label: 'Kullanıcılar', key: null, roles: ['ADMIN'] },
  { to: '/yonetim/ayarlar', label: 'Ayarlar', key: null },
];

export default function AdminLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts>({ tasks: 0, audits: 0, ncrs: 0, applications: 0 });

  useEffect(() => {
    api
      .get<{
        myTasks: { open: number };
        auditQueue: { pending: number; planned: number; inProgress: number };
        ncrs: { open: number };
        byStatus: Array<{ status: string; count: number }>;
      }>('/admin/stats/dashboard')
      .then((d) => {
        const pending = d.byStatus
          .filter((s) => ['NEW', 'IN_REVIEW', 'NEEDS_INFO'].includes(s.status))
          .reduce((sum, s) => sum + s.count, 0);
        setCounts({
          tasks: d.myTasks.open ?? 0,
          audits: (d.auditQueue.pending ?? 0) + (d.auditQueue.planned ?? 0) + (d.auditQueue.inProgress ?? 0),
          ncrs: d.ncrs.open ?? 0,
          applications: pending,
        });
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-text">YANMAR</span>
          <span className="logo-sub">Business Partner Portal</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if ('group' in item && item.group) {
              return (
                <div className="group" key={`g-${i}`}>
                  {item.group}
                </div>
              );
            }
            if (item.roles && !can(...(item.roles as Array<'ADMIN' | 'MODERATOR'>))) return null;
            const count = item.key ? counts[item.key] : 0;
            return (
              <NavLink key={item.to} to={item.to!} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
                {count > 0 && <span className="count">{count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="name">{user?.full_name}</div>
          <div className="role">{label(ROLE, user?.role)}</div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
            onClick={async () => {
              await logout();
              navigate('/yonetim/giris');
            }}
            type="button"
          >
            Çıkış yap
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}

/** Sayfa başlığı çubuğu — her yönetim sayfası tarafından kullanılır. */
export function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </header>
  );
}
