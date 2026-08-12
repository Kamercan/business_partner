import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { PublicShell } from './PublicShell';

export default function Landing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goToGate = () => navigate('/business-partner');

  return (
    <PublicShell onApply={goToGate}>
      <div className="demo-banner">
        <strong>{t('nav.bp')}</strong> · {t('home.banner')}
      </div>

      <section className="hero">
        <div className="hero-banner">{t('hero.banner')}</div>
        <div className="hero-dots">
          <span />
          <span className="active" />
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className="section" id="hakkimizda">
        <h2>{t('home.title')}</h2>
        <p className="subtitle">{t('home.subtitle')}</p>
        <div className="cards">
          <div className="info-card" id="urunler">
            <h3>{t('home.card1.title')}</h3>
            <p>{t('home.card1.body')}</p>
          </div>
          <div className="info-card" id="destek">
            <h3>{t('home.card2.title')}</h3>
            <p>{t('home.card2.body')}</p>
          </div>
          <div className="info-card">
            <h3>{t('home.card3.title')}</h3>
            <p>{t('home.card3.body')}</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={goToGate} type="button">
              {t('nav.bp')}
            </button>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="inner">
          <h2>{t('home.process.title')}</h2>
          <p className="subtitle">{t('modal.subtitle')}</p>
          <div className="steps">
            {[1, 2, 3, 4].map((n) => (
              <div className="step" key={n}>
                <div className="step-num">{n}</div>
                <h4>{t(`home.process.${n}` as 'home.process.1')}</h4>
                <p>{t(`home.process.${n}.body` as 'home.process.1.body')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>{t('home.why.title')}</h2>
        <div className="cards" style={{ marginTop: 24 }}>
          {[1, 2, 3].map((n) => (
            <div className="info-card" key={n}>
              <h3>{t(`home.why.${n}.title` as 'home.why.1.title')}</h3>
              <p>{t(`home.why.${n}.body` as 'home.why.1.body')}</p>
            </div>
          ))}
        </div>
      </section>

    </PublicShell>
  );
}
