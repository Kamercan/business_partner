import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Loading } from './components/ui';
import AdminLayout from './pages/admin/AdminLayout';
import Applications from './pages/admin/Applications';
import ApplicationDetail from './pages/admin/ApplicationDetail';
import AuditDetail from './pages/admin/AuditDetail';
import Audits from './pages/admin/Audits';
import ContractsPage from './pages/admin/Contracts';
import Dashboard from './pages/admin/Dashboard';
import NcrDetail from './pages/admin/NcrDetail';
import Ncrs from './pages/admin/Ncrs';
import Outbox from './pages/admin/Outbox';
import Settings from './pages/admin/Settings';
import SupplierDetail from './pages/admin/SupplierDetail';
import Suppliers from './pages/admin/Suppliers';
import TasksPage from './pages/admin/Tasks';
import Users from './pages/admin/Users';
import BusinessPartner from './pages/public/BusinessPartner';
import Landing from './pages/public/Landing';
import PortalPage from './pages/public/PortalPage';

/** Sorgu parametrelerini koruyarak yönlendirir (takip bağlantıları için). */
function RedirectKeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/yonetim/giris" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* --- Kamuya açık --- */}
      <Route path="/" element={<Landing />} />
      <Route path="/portal/:token" element={<PortalPage />} />

      {/*
        Business Partner tek giriş kapısı: tedarikçi başvurusu, başvuru takibi
        ve ekip girişi aynı ekrandan yürür. Eski adresler buraya yönlendirilir
        ki daha önce gönderilmiş e-postalardaki bağlantılar çalışmaya devam etsin.
      */}
      <Route path="/business-partner" element={<BusinessPartner />} />
      <Route path="/basvuru" element={<Navigate to="/business-partner" replace />} />
      <Route path="/basvuru-takip" element={<RedirectKeepQuery to="/business-partner" />} />
      <Route path="/yonetim/giris" element={<Navigate to="/business-partner?giris=ekip" replace />} />
      <Route
        path="/yonetim"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="basvurular" element={<Applications />} />
        <Route path="basvurular/:id" element={<ApplicationDetail />} />
        <Route path="denetimler" element={<Audits />} />
        <Route path="denetimler/:id" element={<AuditDetail />} />
        <Route path="tedarikciler" element={<Suppliers />} />
        <Route path="tedarikciler/:id" element={<SupplierDetail />} />
        <Route path="sozlesmeler" element={<ContractsPage />} />
        <Route path="uygunsuzluklar" element={<Ncrs />} />
        <Route path="uygunsuzluklar/:id" element={<NcrDetail />} />
        <Route path="gorevler" element={<TasksPage />} />
        <Route path="bildirimler" element={<Outbox />} />
        <Route path="kullanicilar" element={<Users />} />
        <Route path="ayarlar" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
