import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { FileSlot, Modal } from '../../components/ui';
import { useI18n } from '../../i18n';
import { LangToggle } from './PublicShell';

export type Meta = {
  categories: Array<{
    code: string;
    name_tr: string; name_en: string; name_ja: string | null;
    hint_tr: string | null; hint_en: string | null; hint_ja: string | null;
  }>;
  certifications: Array<{ code: string; name: string }>;
  sectors: Array<{ code: string; name_tr: string; name_en: string; name_ja: string | null }>;
  countries: Array<{ code: string; tr: string; en: string; ja: string }>;
  employeeBands: string[];
  revenueBands: string[];
};

type FormState = {
  company_name: string;
  tax_id: string;
  founded_year: string;
  employee_band: string;
  revenue_band: string;
  website: string;
  sector: string;
  sector_other: string;
  contact_name: string;
  contact_position: string;
  email: string;
  phone: string;
  country: string;
  country_other: string;
  city: string;
  address: string;
  references_text: string;
  about: string;
  category_other: string;
};

const EMPTY: FormState = {
  company_name: '', tax_id: '', founded_year: '', employee_band: '', revenue_band: '', website: '',
  sector: '', sector_other: '', contact_name: '', contact_position: '', email: '', phone: '',
  country: '', country_other: '', city: '', address: '', references_text: '', about: '', category_other: '',
};

/** Formda ilerleme göstergesinde sayılan zorunlu alanlar. */
const REQUIRED: Array<keyof FormState> = [
  'company_name', 'tax_id', 'sector', 'contact_name', 'email', 'phone', 'country', 'city',
];

const DOC_SLOTS = [
  { field: 'presentation', titleKey: 'up.presentation', metaKey: 'up.presentation.meta', required: true, accept: '.pdf,.ppt,.pptx' },
  { field: 'catalog', titleKey: 'up.catalog', metaKey: 'up.catalog.meta', required: true, accept: '.pdf' },
  { field: 'iso9001', titleKey: 'up.iso', metaKey: 'up.iso.meta', required: true, accept: '.pdf' },
  { field: 'cert_other', titleKey: 'up.cert.other', metaKey: 'up.cert.other.meta', required: false, accept: '.pdf', multiple: true },
  { field: 'financial', titleKey: 'up.financial', metaKey: 'up.financial.meta', required: false, accept: '.pdf', wide: true },
] as const;

export default function ApplicationForm({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const { t, lang, pick } = useI18n();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, File[] | null>>({});
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ref_no: string } | null>(null);
  const [openTip, setOpenTip] = useState<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  useEffect(() => {
    const close = () => setOpenTip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const otherSector = form.sector === 'diger';
  const otherCountry = form.country === 'other';
  const otherCategory = categories.includes('diger');

  const progress = useMemo(() => {
    let total = REQUIRED.length;
    let done = REQUIRED.filter((k) => form[k].trim() !== '').length;
    if (otherSector) {
      total += 1;
      if (form.sector_other.trim()) done += 1;
    }
    if (otherCountry) {
      total += 1;
      if (form.country_other.trim()) done += 1;
    }
    total += 1; // en az bir ürün grubu
    if (categories.length > 0) done += 1;
    return { done, total };
  }, [form, categories, otherSector, otherCountry]);

  const toggle = (list: string[], setList: (v: string[]) => void, code: string) =>
    setList(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    REQUIRED.forEach((key) => {
      if (!form[key].trim()) next[key] = t('error.required');
    });
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = t('f.email');
    if (otherSector && !form.sector_other.trim()) next.sector_other = t('error.required');
    if (otherCountry && !form.country_other.trim()) next.country_other = t('error.required');
    if (otherCategory && !form.category_other.trim()) next.category_other = t('error.required');
    if (categories.length === 0) next.categories = t('error.categories');

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    setFormError(null);

    if (!consent) {
      setConsentError(true);
      consentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!validate()) {
      setFormError(t('error.required'));
      return;
    }

    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value.trim() !== '') body.append(key, value.trim());
    });
    body.append('categories', JSON.stringify(categories));
    body.append('certifications', JSON.stringify(certifications));
    body.append('kvkk_consent', 'true');
    // Başvuru hangi dilde yapıldıysa bildirim e-postaları da o dilde gider.
    body.append('lang', lang);
    if (honeypot.current?.value) body.append('website_url', honeypot.current.value);

    Object.entries(files).forEach(([field, list]) => {
      list?.forEach((file) => body.append(field, file));
    });

    setSubmitting(true);
    try {
      const data = await api.upload<{ ref_no: string }>('/applications', body);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else {
        setFormError(t('error.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------ Başarı ekranı ----------------------------- */
  if (result) {
    return (
      <Modal title={t('success.title')} onClose={onClose}>
        <div className="success" style={{ padding: '12px 0 0' }}>
          <div className="success-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2>{t('success.title')}</h2>
          <p>{t('success.message')}</p>
          <div className="ref-box">
            <div className="ref-label">{t('success.ref')}</div>
            <div className="ref-num">{result.ref_no}</div>
          </div>
          <div className="success-steps">
            <h4>{t('success.next')}</h4>
            <ol>
              <li>{t('success.step1')}</li>
              <li>{t('success.step2')}</li>
              <li>{t('success.step3')}</li>
              <li>{t('success.step4')}</li>
            </ol>
          </div>
          <p className="small muted" style={{ marginBottom: 20 }}>
            {t('success.track')}
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <Link className="btn" to={`/basvuru-takip?ref=${encodeURIComponent(result.ref_no)}&email=${encodeURIComponent(form.email)}`}>
              {t('nav.track')}
            </Link>
            <button className="btn btn-primary" onClick={onClose} type="button">
              {t('btn.close')}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  /* --------------------------------- Form ---------------------------------- */
  return (
    <Modal
      title={t('modal.title')}
      subtitle={t('modal.subtitle')}
      onClose={onClose}
      headerExtra={<LangToggle />}
      footer={
        <>
          <span className="progress-text small muted">
            {t('progress.text', { done: progress.done, total: progress.total })}
          </span>
          <div className="row">
            <button className="btn" onClick={onClose} type="button" disabled={submitting}>
              {t('btn.cancel')}
            </button>
            <button className="btn btn-primary" onClick={submit} type="button" disabled={submitting}>
              {submitting && <span className="spinner" />}
              {submitting ? t('btn.submitting') : t('btn.submit')}
            </button>
          </div>
        </>
      }
    >
      {formError && <div className="form-error">{formError}</div>}

      {/* Bot tuzağı — ekran okuyuculardan ve kullanıcıdan gizli */}
      <input
        ref={honeypot}
        type="text"
        name="website_url"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
      />

      {/* 1 — Firma bilgileri */}
      <div className="form-group">
        <div className="section-label">
          <span className="num">1</span>
          {t('sec.1')}
        </div>
        <div className="grid-2">
          <div className="field">
            <label>
              {t('f.company')} <span className="req">*</span>
            </label>
            <input
              className={errors.company_name ? 'error' : ''}
              name="company_name"
              autoComplete="organization"
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
              placeholder={t('f.company.ph')}
            />
            {errors.company_name && <span className="err">{errors.company_name}</span>}
          </div>
          <div className="field">
            <label>
              {t('f.tax')} <span className="req">*</span>
            </label>
            <input
              className={errors.tax_id ? 'error' : ''}
              name="tax_id"
              value={form.tax_id}
              onChange={(e) => set('tax_id', e.target.value)}
              placeholder="1234567890"
            />
            {errors.tax_id && <span className="err">{errors.tax_id}</span>}
          </div>
          <div className="field">
            <label>{t('f.year')}</label>
            <input name="founded_year" value={form.founded_year} onChange={(e) => set('founded_year', e.target.value)} placeholder="2005" inputMode="numeric" />
          </div>
          <div className="field">
            <label>{t('f.employees')}</label>
            <select name="employee_band" value={form.employee_band} onChange={(e) => set('employee_band', e.target.value)}>
              <option value="">{t('select.choose')}</option>
              {meta.employeeBands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('f.revenue')}</label>
            <select name="revenue_band" value={form.revenue_band} onChange={(e) => set('revenue_band', e.target.value)}>
              <option value="">{t('select.choose')}</option>
              {meta.revenueBands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('f.website')}</label>
            <input name="website" autoComplete="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </div>

          <div className="field span-2">
            <label>
              {t('f.sector')} <span className="req">*</span>
            </label>
            <select
              name="sector"
              className={errors.sector ? 'error' : ''}
              value={form.sector}
              onChange={(e) => set('sector', e.target.value)}
            >
              <option value="">{t('select.sector')}</option>
              {meta.sectors.map((s) => (
                <option key={s.code} value={s.code}>
                  {pick(s)}
                </option>
              ))}
            </select>
            {errors.sector && <span className="err">{errors.sector}</span>}
          </div>

          <div className={`field-conditional ${otherSector ? 'show' : ''}`}>
            <div className="field">
              <label>
                {t('f.sector.other')} <span className="req">*</span>
              </label>
              <input
                name="sector_other"
                className={errors.sector_other ? 'error' : ''}
                value={form.sector_other}
                onChange={(e) => set('sector_other', e.target.value)}
                placeholder={t('f.sector.other.ph')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2 — İletişim */}
      <div className="form-group">
        <div className="section-label">
          <span className="num">2</span>
          {t('sec.2')}
        </div>
        <div className="grid-2">
          <div className="field">
            <label>
              {t('f.contact')} <span className="req">*</span>
            </label>
            <input
              className={errors.contact_name ? 'error' : ''}
              name="contact_name"
              autoComplete="name"
              value={form.contact_name}
              onChange={(e) => set('contact_name', e.target.value)}
              placeholder={t('f.contact.ph')}
            />
          </div>
          <div className="field">
            <label>{t('f.position')}</label>
            <input name="contact_position" autoComplete="organization-title" value={form.contact_position} onChange={(e) => set('contact_position', e.target.value)} placeholder={t('f.position.ph')} />
          </div>
          <div className="field">
            <label>
              {t('f.email')} <span className="req">*</span>
            </label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              className={errors.email ? 'error' : ''}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder={t('f.email.ph')}
            />
            {errors.email && <span className="err">{errors.email}</span>}
          </div>
          <div className="field">
            <label>
              {t('f.phone')} <span className="req">*</span>
            </label>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              className={errors.phone ? 'error' : ''}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+90 ..."
            />
          </div>
          <div className="field">
            <label>
              {t('f.country')} <span className="req">*</span>
            </label>
            <select name="country" autoComplete="country" className={errors.country ? 'error' : ''} value={form.country} onChange={(e) => set('country', e.target.value)}>
              <option value="">{t('select.country')}</option>
              {meta.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c[lang]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              {t('f.city')} <span className="req">*</span>
            </label>
            <input name="city" autoComplete="address-level2" className={errors.city ? 'error' : ''} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder={t('f.city.ph')} />
          </div>

          <div className={`field-conditional ${otherCountry ? 'show' : ''}`}>
            <div className="field">
              <label>
                {t('f.country.other')} <span className="req">*</span>
              </label>
              <input
                name="country_other"
                className={errors.country_other ? 'error' : ''}
                value={form.country_other}
                onChange={(e) => set('country_other', e.target.value)}
                placeholder={t('f.country.other.ph')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3 — Tedarik kategorileri */}
      <div className="form-group">
        <div className="section-label">
          <span className="num">3</span>
          {t('sec.3')}
        </div>
        <div className="grid-3">
          {meta.categories.map((cat) => {
            const checked = categories.includes(cat.code);
            const hint = pick(cat, 'hint');
            return (
              <label key={cat.code} className={`chip ${checked ? 'checked' : ''} ${hint ? 'has-tip' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(categories, setCategories, cat.code)} />
                <span>{pick(cat)}</span>
                {hint && (
                  <span
                    className={`tip-wrap ${openTip === cat.code ? 'show' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenTip(openTip === cat.code ? null : cat.code);
                    }}
                  >
                    <span className="tip-icon">?</span>
                    <span className="tip-content">{hint}</span>
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {errors.categories && (
          <span className="err" style={{ display: 'block', marginTop: 8 }}>
            {errors.categories}
          </span>
        )}

        <div className={`field-conditional ${otherCategory ? 'show' : ''}`} style={{ gridColumn: 'unset' }}>
          <div className="field" style={{ marginTop: 10 }}>
            <label>
              {t('f.cat.other')} <span className="req">*</span>
            </label>
            <input
              name="category_other"
              className={errors.category_other ? 'error' : ''}
              value={form.category_other}
              onChange={(e) => set('category_other', e.target.value)}
              placeholder={t('f.cat.other.ph')}
            />
          </div>
        </div>
      </div>

      {/* 4 — Sertifikalar */}
      <div className="form-group">
        <div className="section-label">
          <span className="num">4</span>
          {t('sec.4')}
        </div>
        <div className="pill-row">
          {meta.certifications.map((cert) => {
            const checked = certifications.includes(cert.code);
            return (
              <label key={cert.code} className={`chip chip-pill ${checked ? 'checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(certifications, setCertifications, cert.code)} />
                {cert.name}
              </label>
            );
          })}
        </div>
      </div>

      {/* 5 — Tanıtım ve belgeler */}
      <div className="form-group">
        <div className="section-label">
          <span className="num">5</span>
          {t('sec.5')}
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{t('f.refs')}</label>
          <input name="references_text" value={form.references_text} onChange={(e) => set('references_text', e.target.value)} placeholder={t('f.refs.ph')} />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>{t('f.about')}</label>
          <textarea name="about" value={form.about} onChange={(e) => set('about', e.target.value)} placeholder={t('f.about.ph')} />
        </div>

        <div className="upload-grid">
          {DOC_SLOTS.map((slot) => (
            <div key={slot.field} style={'wide' in slot && slot.wide ? { gridColumn: '1 / -1' } : undefined}>
              <FileSlot
                title={t(slot.titleKey)}
                meta={t(slot.metaKey)}
                required={slot.required}
                accept={slot.accept}
                multiple={'multiple' in slot ? slot.multiple : false}
                file={files[slot.field] ?? null}
                onSelect={(list) => setFiles((prev) => ({ ...prev, [slot.field]: list }))}
                labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* KVKK */}
      <div className={`consent ${consentError && !consent ? 'invalid' : ''}`} ref={consentRef}>
        <input
          type="checkbox"
          id="kvkk"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setConsentError(false);
          }}
        />
        <div style={{ flex: 1 }}>
          <label htmlFor="kvkk">
            {t('consent.text')}{' '}
            <a href="#kvkk" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>
              {t('consent.link')}
            </a>
          </label>
          {consentError && !consent && <div className="error-msg">{t('consent.error')}</div>}
        </div>
      </div>
    </Modal>
  );
}
