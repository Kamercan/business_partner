import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'tr' | 'en';

/**
 * Kamuya açık yüzey (tanıtım sayfası, başvuru formu, takip ve tedarikçi
 * self-servis ekranları) tam iki dillidir — yurt dışı tedarikçiler de
 * başvurabildiği için gereklidir. Yönetim paneli Türkçedir; durum/rol gibi
 * ortak etiketler yine iki dilde tutulur.
 */
const dict = {
  tr: {
    'nav.products': 'Ürünler & Servisler',
    'nav.support': 'Destek & İletişim',
    'nav.about': 'Yanmar Hakkında',
    'nav.dealers': 'Bayiler',
    'nav.bp': 'Business Partner',
    'nav.track': 'Başvuru Takibi',
    'nav.admin': 'Yönetim Paneli',

    'hero.banner': 'Yeni Traktör Üretim Tesisimiz Hizmete Açıldı',
    'home.title': 'Global bir aile, yerel bir ortak',
    'home.subtitle': "Yanmar Türkiye, 1912'den bu yana süregelen Yanmar mirasını Türkiye pazarına taşıyor.",
    'home.card1.title': 'Ürünler',
    'home.card1.body': 'Traktörler, dizel motorlar, inşaat makineleri ve enerji çözümleri.',
    'home.card2.title': 'Servis',
    'home.card2.body': 'Türkiye genelinde yetkili servis ve yedek parça ağı ile kesintisiz destek.',
    'home.card3.title': 'Tedarikçi ol',
    'home.card3.body': 'Global tedarik zincirimizin parçası olun. Başvuruları üst menüdeki Business Partner butonundan alıyoruz.',
    'home.why.title': 'Neden Yanmar tedarikçisi olmalısınız?',
    'home.why.1.title': 'Şeffaf değerlendirme',
    'home.why.1.body': 'Başvurunuz tanımlı kriterlerle değerlendirilir, her aşamada bilgilendirilirsiniz.',
    'home.why.2.title': 'Uzun vadeli iş birliği',
    'home.why.2.body': 'Onaylı tedarikçilerimiz çerçeve sözleşmeler ve düzenli RFQ süreçlerine dahil edilir.',
    'home.why.3.title': 'Gelişim odaklı denetim',
    'home.why.3.body': 'Kalite denetimlerimiz not vermekle kalmaz, iyileştirme alanlarını da raporlar.',
    'home.process.title': 'Başvuru süreci',
    'home.process.1': 'Formu doldurun',
    'home.process.1.body': 'Firma bilgileri, ürün grupları ve kalite belgelerinizle başvurun.',
    'home.process.2': 'Ön değerlendirme',
    'home.process.2.body': 'Teknik Satınalma ekibi 10 iş günü içinde başvurunuzu inceler.',
    'home.process.3': 'Kalite denetimi',
    'home.process.3.body': 'Uygun bulunan firmalar denetlenir ve A–D arası notlandırılır.',
    'home.process.4': 'Onaylı tedarikçi',
    'home.process.4.body': 'Havuza katılır, teklif süreçlerimize davet edilirsiniz.',

    'modal.title': 'Tedarikçi Başvuru Formu',
    'modal.subtitle':
      'Yanmar Türkiye tedarikçi havuzuna katılmak için aşağıdaki formu doldurunuz. Başvurunuz Teknik Satınalma ve Kaynak Geliştirme ekibi tarafından değerlendirilecek, 10 iş günü içinde tarafınıza geri dönüş yapılacaktır.',
    'sec.1': 'Firma Bilgileri',
    'sec.2': 'İletişim',
    'sec.3': 'Tedarik Kategorisi — Çoklu Seçim',
    'sec.4': 'Kalite Sertifikaları',
    'sec.5': 'Firma Tanıtımı ve Belgeler',

    'f.company': 'Firma adı',
    'f.company.ph': 'ABC Metal San. Tic. Ltd. Şti.',
    'f.tax': 'Vergi / DUNS no',
    'f.year': 'Kuruluş yılı',
    'f.employees': 'Çalışan sayısı',
    'f.revenue': 'Yıllık ciro (€)',
    'f.website': 'Web sitesi',
    'f.sector': 'Sektör',
    'f.sector.other': 'Sektörünüzü belirtiniz',
    'f.sector.other.ph': 'Lütfen sektörünüzü yazınız',
    'f.contact': 'Yetkili kişi',
    'f.contact.ph': 'Ad Soyad',
    'f.position': 'Pozisyon',
    'f.position.ph': 'Satış Müdürü',
    'f.email': 'E-posta',
    'f.email.ph': 'kontak@firma.com',
    'f.phone': 'Telefon',
    'f.country': 'Ülke',
    'f.country.other': 'Ülkenizi belirtiniz',
    'f.country.other.ph': 'Lütfen ülkenizi yazınız',
    'f.city': 'Şehir',
    'f.address': 'Adres',
    'f.cat.other': 'Diğer ürün grubunu belirtiniz',
    'f.cat.other.ph': 'Tedarik etmek istediğiniz ürün grubunu yazınız',
    'f.refs': 'Ana müşteriler / referanslar',
    'f.refs.ph': 'Firma A, Firma B, Firma C',
    'f.about': 'Kısa firma tanıtımı',
    'f.about.ph': 'Üretim yetkinlikleri, makine parkuru, yıllık kapasite, teslim süreleri...',
    'select.sector': 'Sektör seçiniz...',
    'select.country': 'Ülke seçiniz...',
    'select.choose': 'Seçiniz...',

    'up.presentation': 'Şirket Sunumu',
    'up.presentation.meta': 'PDF, PPT · max 20 MB',
    'up.catalog': 'Ürün Kataloğu',
    'up.catalog.meta': 'PDF · max 20 MB',
    'up.iso': 'ISO 9001 Sertifikası',
    'up.iso.meta': 'PDF · max 10 MB',
    'up.cert.other': 'Diğer Sertifikalar',
    'up.cert.other.meta': 'PDF, çoklu · IATF, CE, ISO 14001 vb.',
    'up.financial': 'Mali Tablo Özeti',
    'up.financial.meta': 'PDF · Son 2 yıllık ciro/bilanço özeti — gizli işlenir',
    'up.required': 'Zorunlu',
    'up.optional': 'Opsiyonel',
    'up.uploaded': 'yüklendi',
    'up.remove': 'Kaldır',
    'up.hint': 'Dosya seçmek için tıklayın veya sürükleyip bırakın',

    'consent.text':
      'KVKK kapsamında kişisel verilerimin Yanmar Türkiye Makine Sanayi A.Ş. tarafından tedarikçi değerlendirme süreci için işlenmesini kabul ediyorum.',
    'consent.link': 'Aydınlatma metni',
    'consent.error': 'Devam etmek için KVKK onayını işaretleyiniz.',

    'btn.cancel': 'İptal',
    'btn.submit': 'Başvuruyu gönder',
    'btn.submitting': 'Gönderiliyor...',
    'btn.close': 'Kapat',
    'btn.send': 'Gönder',
    'btn.query': 'Sorgula',
    'btn.upload': 'Yükle',

    'progress.text': '{done} / {total} zorunlu alan dolduruldu',
    'error.required': 'Lütfen zorunlu alanları doldurunuz.',
    'error.categories': 'En az bir ürün grubu seçiniz.',
    'error.generic': 'Başvuru gönderilemedi. Lütfen tekrar deneyiniz.',

    'success.title': 'Başvurunuz alındı',
    'success.message':
      'Teşekkür ederiz. Başvurunuz Teknik Satınalma ekibimize iletildi. Onay e-postası birazdan adresinize ulaşacaktır.',
    'success.ref': 'BAŞVURU REFERANS NO',
    'success.next': 'Bundan sonra ne olacak?',
    'success.step1': 'Başvurunuz 10 iş günü içinde ön değerlendirmeden geçer.',
    'success.step2': 'Uygun bulunursa tedarikçi anket formu gönderilir.',
    'success.step3': 'Ziyaret / denetim planlaması yapılır.',
    'success.step4': 'Potansiyel RFQ süreçlerine davet edilirsiniz.',
    'success.track': 'Bu referans numarasını saklayınız; başvuru takip sayfasından durumunuzu sorgulayabilirsiniz.',

    'track.title': 'Başvuru Takibi',
    'track.subtitle': 'Referans numaranız ve başvuruda kullandığınız e-posta ile başvurunuzun güncel durumunu görebilirsiniz.',
    'track.ref': 'Başvuru referans no',
    'track.notfound': 'Bu referans numarası ve e-posta ile eşleşen bir başvuru bulunamadı.',
    'track.status': 'Başvuru durumu',
    'track.submitted': 'Başvuru tarihi',
    'track.updated': 'Son güncelleme',
    'track.messages': 'Yanmar ekibinden mesajlar',
    'track.audit': 'Kalite denetimi',

    'portal.title': 'Tedarikçi Self-Servis Alanı',
    'portal.docs': 'Belgeler',
    'portal.upload': 'Belge yükle',
    'portal.message': 'Mesajınız',
    'portal.ncr.title': 'Uygunsuzluk Raporu — Düzeltici Faaliyet',
    'portal.ncr.containment': 'Acil önlem (containment)',
    'portal.ncr.root': 'Kök neden analizi',
    'portal.ncr.corrective': 'Düzeltici faaliyet',
    'portal.ncr.preventive': 'Önleyici faaliyet',
    'portal.ncr.submit': 'Cevabı gönder',
    'portal.expired': 'Bu bağlantının süresi dolmuş veya geçersiz.',
    'portal.sent': 'Cevabınız iletildi. Kalite birimimiz inceleyecektir.',

    'footer.text': '© 2026 Yanmar Türkiye Makine Sanayi A.Ş. · Business Partner Portalı',
  },

  en: {
    'nav.products': 'Products & Services',
    'nav.support': 'Support & Contact',
    'nav.about': 'About Yanmar',
    'nav.dealers': 'Dealers',
    'nav.bp': 'Business Partner',
    'nav.track': 'Track Application',
    'nav.admin': 'Admin Panel',

    'hero.banner': 'Our New Tractor Production Facility Is Now Open',
    'home.title': 'A global family, a local partner',
    'home.subtitle': 'Yanmar Türkiye brings the Yanmar heritage, continuing since 1912, to the Turkish market.',
    'home.card1.title': 'Products',
    'home.card1.body': 'Tractors, diesel engines, construction machinery and energy solutions.',
    'home.card2.title': 'Service',
    'home.card2.body': 'Uninterrupted support with an authorised service and spare parts network across Türkiye.',
    'home.card3.title': 'Become a supplier',
    'home.card3.body': 'Join our global supply chain. We accept applications via the Business Partner button above.',
    'home.why.title': 'Why become a Yanmar supplier?',
    'home.why.1.title': 'Transparent evaluation',
    'home.why.1.body': 'Your application is assessed against defined criteria and you are informed at every stage.',
    'home.why.2.title': 'Long-term cooperation',
    'home.why.2.body': 'Approved suppliers are included in framework agreements and regular RFQ processes.',
    'home.why.3.title': 'Development-focused audits',
    'home.why.3.body': 'Our quality audits do not just grade — they also report improvement areas.',
    'home.process.title': 'Application process',
    'home.process.1': 'Fill in the form',
    'home.process.1.body': 'Apply with your company details, product groups and quality certificates.',
    'home.process.2': 'Pre-evaluation',
    'home.process.2.body': 'The Technical Procurement team reviews your application within 10 business days.',
    'home.process.3': 'Quality audit',
    'home.process.3.body': 'Eligible companies are audited and graded from A to D.',
    'home.process.4': 'Approved supplier',
    'home.process.4.body': 'You join the pool and are invited to our quotation processes.',

    'modal.title': 'Supplier Application Form',
    'modal.subtitle':
      'Please complete the form below to join the Yanmar Türkiye supplier pool. Your application will be evaluated by the Technical Procurement and Sourcing team, and we will respond within 10 business days.',
    'sec.1': 'Company Information',
    'sec.2': 'Contact',
    'sec.3': 'Supply Category — Multi-select',
    'sec.4': 'Quality Certifications',
    'sec.5': 'Company Profile and Documents',

    'f.company': 'Company name',
    'f.company.ph': 'ABC Metal Co. Ltd.',
    'f.tax': 'Tax / DUNS number',
    'f.year': 'Year founded',
    'f.employees': 'Number of employees',
    'f.revenue': 'Annual revenue (€)',
    'f.website': 'Website',
    'f.sector': 'Industry sector',
    'f.sector.other': 'Please specify your sector',
    'f.sector.other.ph': 'Type your sector here',
    'f.contact': 'Primary contact',
    'f.contact.ph': 'Full name',
    'f.position': 'Position',
    'f.position.ph': 'Sales Manager',
    'f.email': 'Email',
    'f.email.ph': 'contact@company.com',
    'f.phone': 'Phone',
    'f.country': 'Country',
    'f.country.other': 'Please specify your country',
    'f.country.other.ph': 'Type your country here',
    'f.city': 'City',
    'f.address': 'Address',
    'f.cat.other': 'Please specify the other product group',
    'f.cat.other.ph': 'Type the product group you want to supply',
    'f.refs': 'Key customers / references',
    'f.refs.ph': 'Company A, Company B, Company C',
    'f.about': 'Brief company profile',
    'f.about.ph': 'Production capabilities, machinery, annual capacity, lead times...',
    'select.sector': 'Select sector...',
    'select.country': 'Select country...',
    'select.choose': 'Select...',

    'up.presentation': 'Company Presentation',
    'up.presentation.meta': 'PDF, PPT · max 20 MB',
    'up.catalog': 'Product Catalog',
    'up.catalog.meta': 'PDF · max 20 MB',
    'up.iso': 'ISO 9001 Certificate',
    'up.iso.meta': 'PDF · max 10 MB',
    'up.cert.other': 'Other Certificates',
    'up.cert.other.meta': 'PDF, multiple · IATF, CE, ISO 14001 etc.',
    'up.financial': 'Financial Summary',
    'up.financial.meta': 'PDF · Last 2 years revenue/balance summary — confidential',
    'up.required': 'Required',
    'up.optional': 'Optional',
    'up.uploaded': 'uploaded',
    'up.remove': 'Remove',
    'up.hint': 'Click to select a file or drag and drop',

    'consent.text':
      'I consent to the processing of my personal data by Yanmar Türkiye Makine Sanayi A.Ş. for the supplier evaluation process under KVKK / GDPR.',
    'consent.link': 'Privacy notice',
    'consent.error': 'Please tick the privacy consent to continue.',

    'btn.cancel': 'Cancel',
    'btn.submit': 'Submit application',
    'btn.submitting': 'Submitting...',
    'btn.close': 'Close',
    'btn.send': 'Send',
    'btn.query': 'Search',
    'btn.upload': 'Upload',

    'progress.text': '{done} / {total} required fields completed',
    'error.required': 'Please complete the required fields.',
    'error.categories': 'Select at least one product group.',
    'error.generic': 'The application could not be submitted. Please try again.',

    'success.title': 'Application received',
    'success.message':
      'Thank you. Your application has been forwarded to our Technical Procurement team. A confirmation email will be sent shortly.',
    'success.ref': 'APPLICATION REFERENCE NO',
    'success.next': 'What happens next?',
    'success.step1': 'Your application is pre-evaluated within 10 business days.',
    'success.step2': 'If approved, a detailed supplier questionnaire is sent.',
    'success.step3': 'A site visit / audit is scheduled.',
    'success.step4': 'You are invited to potential RFQ processes.',
    'success.track': 'Please keep this reference number; you can check your status on the tracking page.',

    'track.title': 'Application Tracking',
    'track.subtitle': 'Check the current status of your application with your reference number and the email you applied with.',
    'track.ref': 'Application reference no',
    'track.notfound': 'No application matches this reference number and email address.',
    'track.status': 'Application status',
    'track.submitted': 'Submitted on',
    'track.updated': 'Last updated',
    'track.messages': 'Messages from the Yanmar team',
    'track.audit': 'Quality audit',

    'portal.title': 'Supplier Self-Service Area',
    'portal.docs': 'Documents',
    'portal.upload': 'Upload document',
    'portal.message': 'Your message',
    'portal.ncr.title': 'Non-Conformance Report — Corrective Action',
    'portal.ncr.containment': 'Containment action',
    'portal.ncr.root': 'Root cause analysis',
    'portal.ncr.corrective': 'Corrective action',
    'portal.ncr.preventive': 'Preventive action',
    'portal.ncr.submit': 'Submit response',
    'portal.expired': 'This link has expired or is invalid.',
    'portal.sent': 'Your response has been submitted. Our quality team will review it.',

    'footer.text': '© 2026 Yanmar Türkiye Makine Sanayi A.Ş. · Business Partner Portal',
  },
} as const;

export type TranslationKey = keyof (typeof dict)['tr'];

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** Sunucudan gelen iki dilli kayıtlar için yardımcı. */
  pick: (row: { name_tr?: string; name_en?: string; hint_tr?: string | null; hint_en?: string | null }, field?: 'name' | 'hint') => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('bp_lang');
    return stored === 'en' || stored === 'tr' ? stored : 'tr';
  });

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem('bp_lang', next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text: string = dict[lang][key] ?? dict.tr[key] ?? String(key);
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replaceAll(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [lang],
  );

  const pick = useCallback<I18nValue['pick']>(
    (row, field = 'name') => {
      const key = `${field}_${lang}` as keyof typeof row;
      const fallback = `${field}_tr` as keyof typeof row;
      return (row[key] as string) ?? (row[fallback] as string) ?? '';
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, pick }), [lang, setLang, t, pick]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
