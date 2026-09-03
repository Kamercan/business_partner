import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { Compare } from './pages/Compare.js';
import { SeriesDetail } from './pages/SeriesDetail.js';
import { Sources } from './pages/Sources.js';
import { DataEntry } from './pages/DataEntry.js';
import { api } from './lib/api.js';
import { applyTheme, readTheme, type Theme } from './lib/theme.js';
import { relativeTime } from './lib/format.js';

export function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [refreshing, setRefreshing] = useState(false);
  const [lastIngest, setLastIngest] = useState<string | null>(null);

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    const tick = () => api.status()
      .then((s) => { setRefreshing(s.refreshing); setLastIngest(s.lastIngestAt); })
      .catch(() => undefined);
    void tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try { await api.refresh(); } catch { /* durum yoklaması zaten gösterecek */ }
  };

  const cycleTheme = () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Piyasa &amp; Maliyet</strong>
          <span>göstergeler · geçmiş · kaynaklar</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Pano</NavLink>
          <NavLink to="/karsilastir" className={({ isActive }) => (isActive ? 'active' : '')}>Karşılaştır</NavLink>
          <NavLink to="/kaynaklar" className={({ isActive }) => (isActive ? 'active' : '')}>Kaynaklar</NavLink>
          <NavLink to="/veri-girisi" className={({ isActive }) => (isActive ? 'active' : '')}>Veri girişi</NavLink>
        </nav>
        <div className="spacer" />
        <span className="small muted" title="Son otomatik güncelleme">
          {refreshing ? 'güncelleniyor…' : `güncelleme: ${relativeTime(lastIngest)}`}
        </span>
        <button className="btn" onClick={refresh} disabled={refreshing}>Şimdi güncelle</button>
        <button className="btn" onClick={cycleTheme} title={`Tema: ${theme}`} aria-label="Temayı değiştir">
          {theme === 'system' ? '◐' : theme === 'light' ? '☀' : '☾'}
        </button>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/karsilastir" element={<Compare />} />
          <Route path="/seri/:id" element={<SeriesDetail />} />
          <Route path="/kaynaklar" element={<Sources />} />
          <Route path="/veri-girisi" element={<DataEntry />} />
          <Route path="*" element={<div className="empty">Sayfa bulunamadı.</div>} />
        </Routes>
      </main>
    </div>
  );
}
