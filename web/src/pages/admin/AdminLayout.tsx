import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n, type TranslationKey } from '../../i18n';
import { LangToggle } from '../public/PublicShell';
import { ROLE, label } from '../../lib/labels';

type Counts = { tasks: number; audits: number; ncrs: number; applications: number };

const NAV: Array<{
  to?: string;
  end?: boolean;
  label?: TranslationKey;
  key?: 'tasks' | 'applications' | 'audits' | 'ncrs' | null;
  roles?: string[];
  group?: TranslationKey;
}> = [
  { to: '/yonetim', end: true, label: 'nav.dashboard', key: null },
  { to: '/yonetim/gorevler', label: 'nav.tasks', key: 'tasks' },
  { to: '/yonetim/basvurular', label: 'nav.applications', key: 'applications' },
  { to: '/yonetim/denetimler', label: 'nav.audits', key: 'audits' },
  { to: '/yonetim/tedarikciler', label: 'nav.suppliers', key: null },
  { to: '/yonetim/sozlesmeler', label: 'nav.contracts', key: null },
  { to: '/yonetim/uygunsuzluklar', label: 'nav.ncrs', key: 'ncrs' },

  { group: 'nav.system' },
  { to: '/yonetim/bildirimler', label: 'nav.outbox', key: null },
  { to: '/yonetim/kullanicilar', label: 'nav.users', key: null, roles: ['ADMIN'] },
  { to: '/yonetim/ayarlar', label: 'nav.settings', key: null },
];

export default function AdminLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
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
            if (item.group) {
              return (
                <div className="group" key={`g-${i}`}>
                  {t(item.group)}
                </div>
              );
            }
            if (item.roles && !can(...(item.roles as Array<'ADMIN' | 'MODERATOR'>))) return null;
            const count = item.key ? counts[item.key] : 0;
            return (
              <NavLink key={item.to} to={item.to!} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {t(item.label!)}
                {count > 0 && <span className="count">{count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="name">{user?.full_name}</div>
          <div className="role">{label(ROLE, user?.role, lang)}</div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
            onClick={async () => {
              await logout();
              navigate('/yonetim/giris');
            }}
            type="button"
          >
            {t('admin.logout')}
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
      <div className="row wrap">
        {actions}
        <LangToggle />
      </div>
    </header>
  );
}
