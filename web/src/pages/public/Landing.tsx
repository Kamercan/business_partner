import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import ApplicationForm, { type Meta } from './ApplicationForm';
import { PublicShell } from './PublicShell';

export default function Landing({ openForm = false }: { openForm?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [open, setOpen] = useState(openForm);

  useEffect(() => {
    api
      .get<Meta>('/meta')
      .then(setMeta)
      .catch(() => toast.push('Form verileri yüklenemedi. Sayfayı yenileyin.', 'error'));
  }, [toast]);

  return (
    <PublicShell onApply={() => setOpen(true)}>
      <div className="demo-banner">
        <strong>Business Partner</strong> · Yanmar Türkiye tedarikçi başvuru ve değerlendirme portalı — başvurmak için sağ
        üstteki butonu kullanın.
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
            <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => setOpen(true)} type="button">
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

      {open && meta && <ApplicationForm meta={meta} onClose={() => setOpen(false)} />}
    </PublicShell>
  );
}
