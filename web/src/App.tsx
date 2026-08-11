import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Loading } from './components/ui';
import AdminLayout from './pages/admin/AdminLayout';
import Applications from './pages/admin/Applications';
import ApplicationDetail from './pages/admin/ApplicationDetail';
import AuditDetail from './pages/admin/AuditDetail';
import Audits from './pages/admin/Audits';
import ContractsPage from './pages/admin/Contracts';
import Dashboard from './pages/admin/Dashboard';
import ImportPage from './pages/admin/ImportPage';
import Login from './pages/admin/Login';
import NcrDetail from './pages/admin/NcrDetail';
import Ncrs from './pages/admin/Ncrs';
import Outbox from './pages/admin/Outbox';
import Settings from './pages/admin/Settings';
import SupplierDetail from './pages/admin/SupplierDetail';
import Suppliers from './pages/admin/Suppliers';
import TasksPage from './pages/admin/Tasks';
import Users from './pages/admin/Users';
import Landing from './pages/public/Landing';
import PortalPage from './pages/public/PortalPage';
import TrackPage from './pages/public/TrackPage';

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
      <Route path="/basvuru" element={<Landing openForm />} />
      <Route path="/basvuru-takip" element={<TrackPage />} />
      <Route path="/portal/:token" element={<PortalPage />} />

      {/* --- Yönetim --- */}
      <Route path="/yonetim/giris" element={<Login />} />
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
        <Route path="ice-aktar" element={<ImportPage />} />
        <Route path="bildirimler" element={<Outbox />} />
        <Route path="kullanicilar" element={<Users />} />
        <Route path="ayarlar" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
