import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

export function YanmarLogo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="row" style={{ gap: 10 }}>
      <span className="logo-text" style={compact ? { fontSize: 18 } : undefined}>
        YANMAR
      </span>
      {!compact && <span className="logo-sub">Türkiye</span>}
    </Link>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle">
      <button type="button" className={lang === 'tr' ? 'active' : ''} onClick={() => setLang('tr')}>
        TR
      </button>
      <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  );
}

export function PublicHeader({ onApply }: { onApply?: () => void }) {
  const { t } = useI18n();
  return (
    <header className="site-header">
      <YanmarLogo />
      <nav className="site-nav">
        <a href="#urunler">{t('nav.products')}</a>
        <a href="#destek">{t('nav.support')}</a>
        <a href="#hakkimizda">{t('nav.about')}</a>
      </nav>
      <div className="header-right">
        <LangToggle />
        {onApply ? (
          <button className="bp-btn" onClick={onApply} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 7h-4V3H8v4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM10 5h4v2h-4V5z" />
            </svg>
            {t('nav.bp')}
          </button>
        ) : (
          <Link to="/business-partner" className="bp-btn">
            {t('nav.bp')}
          </Link>
        )}
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      {t('footer.text')} · <Link to="/yonetim">{t('nav.admin')}</Link>
    </footer>
  );
}

export function PublicShell({ children, onApply }: { children: ReactNode; onApply?: () => void }) {
  return (
    <>
      <PublicHeader onApply={onApply} />
      {children}
      <PublicFooter />
    </>
  );
}
