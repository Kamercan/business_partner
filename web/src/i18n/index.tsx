import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminDict } from './dict.admin';
import type { Entry } from './entry';

export type { Entry };

export type Lang = 'tr' | 'en' | 'ja';

export const LANGS: Array<{ code: Lang; short: string; label: string }> = [
  { code: 'tr', short: 'TR', label: 'Türkçe' },
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'ja', short: '日本語', label: '日本語' },
];

/**
 * Tedarikçiye dönük tüm yüzey (tanıtım sayfası, Business Partner kapısı,
 * başvuru formu, başvuru takibi, onaylı tedarikçi portalı ve süreli bağlantıyla
 * açılan self-servis ekran) üç dillidir: Türkçe, İngilizce, Japonca.
 *
 * Yönetim paneli de aynı şekilde üç dillidir; sözlüğü büyüklüğü nedeniyle ayrı
 * bir dosyada (`dict.admin.ts`) tutulur ve burada birleştirilir.
 *
 * Sözlük anahtar bazında tutulur — üç dil yan yana durduğu için eksik çeviri
 * derleme hatası verir, gözden kaçamaz.
 */
const publicDict = {
  // --------------------------------- Menü ----------------------------------
  'nav.products': { tr: 'Ürünler & Servisler', en: 'Products & Services', ja: '製品・サービス' },
  'nav.support': { tr: 'Destek & İletişim', en: 'Support & Contact', ja: 'サポート・お問い合わせ' },
  'nav.about': { tr: 'Yanmar Hakkında', en: 'About Yanmar', ja: 'ヤンマーについて' },
  'nav.dealers': { tr: 'Bayiler', en: 'Dealers', ja: '販売店' },
  'nav.bp': { tr: 'Business Partner', en: 'Business Partner', ja: 'ビジネスパートナー' },
  'nav.track': { tr: 'Başvuru Takibi', en: 'Track Application', ja: '申請状況の確認' },
  'nav.admin': { tr: 'Yönetim Paneli', en: 'Admin Panel', ja: '管理パネル' },

  // ------------------------------ Tanıtım sayfası ---------------------------
  'home.banner': {
    tr: 'Yanmar Türkiye tedarikçi başvuru ve değerlendirme portalı — başvurmak için sağ üstteki butonu kullanın.',
    en: 'Yanmar Türkiye supplier application and evaluation portal — use the button at the top right to apply.',
    ja: 'ヤンマートルコのサプライヤー申請・評価ポータルです。お申し込みは右上のボタンからどうぞ。',
  },
  'hero.banner': {
    tr: 'Yeni Traktör Üretim Tesisimiz Hizmete Açıldı',
    en: 'Our New Tractor Production Facility Is Now Open',
    ja: '新トラクター生産工場が稼働を開始しました',
  },
  'home.title': {
    tr: 'Global bir aile, yerel bir ortak',
    en: 'A global family, a local partner',
    ja: 'グローバルな一員として、地域のパートナーとして',
  },
  'home.subtitle': {
    tr: "Yanmar Türkiye, 1912'den bu yana süregelen Yanmar mirasını Türkiye pazarına taşıyor.",
    en: 'Yanmar Türkiye brings the Yanmar heritage, continuing since 1912, to the Turkish market.',
    ja: 'ヤンマートルコは、1912年から受け継がれるヤンマーの伝統をトルコ市場にお届けしています。',
  },
  'home.card1.title': { tr: 'Ürünler', en: 'Products', ja: '製品' },
  'home.card1.body': {
    tr: 'Traktörler, dizel motorlar, inşaat makineleri ve enerji çözümleri.',
    en: 'Tractors, diesel engines, construction machinery and energy solutions.',
    ja: 'トラクター、ディーゼルエンジン、建設機械、エネルギーソリューション。',
  },
  'home.card2.title': { tr: 'Servis', en: 'Service', ja: 'サービス' },
  'home.card2.body': {
    tr: 'Türkiye genelinde yetkili servis ve yedek parça ağı ile kesintisiz destek.',
    en: 'Uninterrupted support with an authorised service and spare parts network across Türkiye.',
    ja: 'トルコ全土の正規サービス・純正部品ネットワークによる切れ目のないサポート。',
  },
  'home.card3.title': { tr: 'Tedarikçi ol', en: 'Become a supplier', ja: 'サプライヤーになる' },
  'home.card3.body': {
    tr: 'Global tedarik zincirimizin parçası olun. Başvuruları üst menüdeki Business Partner butonundan alıyoruz.',
    en: 'Join our global supply chain. We accept applications via the Business Partner button above.',
    ja: '当社のグローバルサプライチェーンに参加しませんか。お申し込みは上部のビジネスパートナーボタンから受け付けています。',
  },
  'home.why.title': {
    tr: 'Neden Yanmar tedarikçisi olmalısınız?',
    en: 'Why become a Yanmar supplier?',
    ja: 'ヤンマーのサプライヤーになるメリット',
  },
  'home.why.1.title': { tr: 'Şeffaf değerlendirme', en: 'Transparent evaluation', ja: '透明性のある評価' },
  'home.why.1.body': {
    tr: 'Başvurunuz tanımlı kriterlerle değerlendirilir, her aşamada bilgilendirilirsiniz.',
    en: 'Your application is assessed against defined criteria and you are informed at every stage.',
    ja: '申請は明確な基準に基づいて評価され、各段階でご連絡いたします。',
  },
  'home.why.2.title': { tr: 'Uzun vadeli iş birliği', en: 'Long-term cooperation', ja: '長期的な協力関係' },
  'home.why.2.body': {
    tr: 'Onaylı tedarikçilerimiz çerçeve sözleşmeler ve düzenli RFQ süreçlerine dahil edilir.',
    en: 'Approved suppliers are included in framework agreements and regular RFQ processes.',
    ja: '承認サプライヤーは基本契約および定期的な見積依頼（RFQ）の対象となります。',
  },
  'home.why.3.title': { tr: 'Gelişim odaklı denetim', en: 'Development-focused audits', ja: '改善につながる監査' },
  'home.why.3.body': {
    tr: 'Kalite denetimlerimiz not vermekle kalmaz, iyileştirme alanlarını da raporlar.',
    en: 'Our quality audits do not just grade — they also report improvement areas.',
    ja: '品質監査では評価点をお伝えするだけでなく、改善すべき項目もご報告します。',
  },
  'home.process.title': { tr: 'Başvuru süreci', en: 'Application process', ja: '申請の流れ' },
  'home.process.1': { tr: 'Formu doldurun', en: 'Fill in the form', ja: 'フォームに入力' },
  'home.process.1.body': {
    tr: 'Firma bilgileri, ürün grupları ve kalite belgelerinizle başvurun.',
    en: 'Apply with your company details, product groups and quality certificates.',
    ja: '会社情報、供給品目、品質認証をご記入のうえお申し込みください。',
  },
  'home.process.2': { tr: 'Ön değerlendirme', en: 'Pre-evaluation', ja: '一次評価' },
  'home.process.2.body': {
    tr: 'Teknik Satınalma ekibi 10 iş günü içinde başvurunuzu inceler.',
    en: 'The Technical Procurement team reviews your application within 10 business days.',
    ja: '技術調達チームが10営業日以内に申請内容を確認します。',
  },
  'home.process.3': { tr: 'Kalite denetimi', en: 'Quality audit', ja: '品質監査' },
  'home.process.3.body': {
    tr: 'Uygun bulunan firmalar denetlenir ve A–D arası notlandırılır.',
    en: 'Eligible companies are audited and graded from A to D.',
    ja: '対象となった企業を監査し、A〜Dで評価します。',
  },
  'home.process.4': { tr: 'Onaylı tedarikçi', en: 'Approved supplier', ja: '承認サプライヤー' },
  'home.process.4.body': {
    tr: 'Havuza katılır, teklif süreçlerimize davet edilirsiniz.',
    en: 'You join the pool and are invited to our quotation processes.',
    ja: 'サプライヤーリストに登録され、見積依頼にご招待します。',
  },

  // ----------------------------- Başvuru formu ------------------------------
  'modal.title': { tr: 'Tedarikçi Başvuru Formu', en: 'Supplier Application Form', ja: 'サプライヤー申請フォーム' },
  'modal.subtitle': {
    tr: 'Yanmar Türkiye tedarikçi havuzuna katılmak için aşağıdaki formu doldurunuz. Başvurunuz Teknik Satınalma ve Kaynak Geliştirme ekibi tarafından değerlendirilecek, 10 iş günü içinde tarafınıza geri dönüş yapılacaktır.',
    en: 'Please complete the form below to join the Yanmar Türkiye supplier pool. Your application will be evaluated by the Technical Procurement and Sourcing team, and we will respond within 10 business days.',
    ja: 'ヤンマートルコのサプライヤーリストへの登録をご希望の方は、以下のフォームにご記入ください。技術調達・ソーシングチームが内容を確認し、10営業日以内にご連絡いたします。',
  },
  'sec.1': { tr: 'Firma Bilgileri', en: 'Company Information', ja: '会社情報' },
  'sec.2': { tr: 'İletişim', en: 'Contact', ja: 'ご連絡先' },
  'sec.3': { tr: 'Tedarik Kategorisi — Çoklu Seçim', en: 'Supply Category — Multi-select', ja: '供給品目（複数選択可）' },
  'sec.4': { tr: 'Kalite Sertifikaları', en: 'Quality Certifications', ja: '品質認証' },
  'sec.5': { tr: 'Firma Tanıtımı ve Belgeler', en: 'Company Profile and Documents', ja: '会社概要と提出書類' },

  'f.company': { tr: 'Firma adı', en: 'Company name', ja: '会社名' },
  'f.company.ph': { tr: 'ABC Metal San. Tic. Ltd. Şti.', en: 'ABC Metal Co. Ltd.', ja: '株式会社ABCメタル' },
  'f.tax': { tr: 'Vergi / DUNS no', en: 'Tax / DUNS number', ja: '法人番号 / DUNS番号' },
  'f.year': { tr: 'Kuruluş yılı', en: 'Year founded', ja: '設立年' },
  'f.employees': { tr: 'Çalışan sayısı', en: 'Number of employees', ja: '従業員数' },
  'f.revenue': { tr: 'Yıllık ciro (€)', en: 'Annual revenue (€)', ja: '年間売上高（€）' },
  'f.website': { tr: 'Web sitesi', en: 'Website', ja: 'ウェブサイト' },
  'f.sector': { tr: 'Sektör', en: 'Industry sector', ja: '業種' },
  'f.sector.other': { tr: 'Sektörünüzü belirtiniz', en: 'Please specify your sector', ja: '業種をご記入ください' },
  'f.sector.other.ph': { tr: 'Lütfen sektörünüzü yazınız', en: 'Type your sector here', ja: '業種を入力してください' },
  'f.contact': { tr: 'Yetkili kişi', en: 'Primary contact', ja: 'ご担当者名' },
  'f.contact.ph': { tr: 'Ad Soyad', en: 'Full name', ja: '山田 太郎' },
  'f.position': { tr: 'Pozisyon', en: 'Position', ja: '役職' },
  'f.position.ph': { tr: 'Satış Müdürü', en: 'Sales Manager', ja: '営業部長' },
  'f.email': { tr: 'E-posta', en: 'Email', ja: 'メールアドレス' },
  'f.email.ph': { tr: 'kontak@firma.com', en: 'contact@company.com', ja: 'contact@company.co.jp' },
  'f.phone': { tr: 'Telefon', en: 'Phone', ja: '電話番号' },
  'f.password': { tr: 'Parola', en: 'Password', ja: 'パスワード' },
  'f.country': { tr: 'Ülke', en: 'Country', ja: '国' },
  'f.country.other': { tr: 'Ülkenizi belirtiniz', en: 'Please specify your country', ja: '国名をご記入ください' },
  'f.country.other.ph': { tr: 'Lütfen ülkenizi yazınız', en: 'Type your country here', ja: '国名を入力してください' },
  'f.city': { tr: 'Şehir', en: 'City', ja: '都市' },
  'f.city.ph': { tr: 'İzmir', en: 'Izmir', ja: '大阪' },
  'f.address': { tr: 'Adres', en: 'Address', ja: '住所' },
  'f.cat.other': {
    tr: 'Diğer ürün grubunu belirtiniz',
    en: 'Please specify the other product group',
    ja: 'その他の供給品目をご記入ください',
  },
  'f.cat.other.ph': {
    tr: 'Tedarik etmek istediğiniz ürün grubunu yazınız',
    en: 'Type the product group you want to supply',
    ja: '供給をご希望の品目を入力してください',
  },
  'f.refs': { tr: 'Ana müşteriler / referanslar', en: 'Key customers / references', ja: '主要取引先・実績' },
  'f.refs.ph': { tr: 'Firma A, Firma B, Firma C', en: 'Company A, Company B, Company C', ja: 'A社、B社、C社' },
  'f.about': { tr: 'Kısa firma tanıtımı', en: 'Brief company profile', ja: '会社概要' },
  'f.about.ph': {
    tr: 'Üretim yetkinlikleri, makine parkuru, yıllık kapasite, teslim süreleri...',
    en: 'Production capabilities, machinery, annual capacity, lead times...',
    ja: '生産能力、保有設備、年間生産量、納期など',
  },
  'select.sector': { tr: 'Sektör seçiniz...', en: 'Select sector...', ja: '業種を選択...' },
  'select.country': { tr: 'Ülke seçiniz...', en: 'Select country...', ja: '国を選択...' },
  'select.choose': { tr: 'Seçiniz...', en: 'Select...', ja: '選択...' },

  'up.presentation': { tr: 'Şirket Sunumu', en: 'Company Presentation', ja: '会社紹介資料' },
  'up.presentation.meta': { tr: 'PDF, PPT · max 20 MB', en: 'PDF, PPT · max 20 MB', ja: 'PDF・PPT／最大20MB' },
  'up.catalog': { tr: 'Ürün Kataloğu', en: 'Product Catalog', ja: '製品カタログ' },
  'up.catalog.meta': { tr: 'PDF · max 20 MB', en: 'PDF · max 20 MB', ja: 'PDF／最大20MB' },
  'up.iso': { tr: 'ISO 9001 Sertifikası', en: 'ISO 9001 Certificate', ja: 'ISO 9001 認証書' },
  'up.iso.meta': { tr: 'PDF · max 10 MB', en: 'PDF · max 10 MB', ja: 'PDF／最大10MB' },
  'up.cert.other': { tr: 'Diğer Sertifikalar', en: 'Other Certificates', ja: 'その他の認証' },
  'up.cert.other.meta': {
    tr: 'PDF, çoklu · IATF, CE, ISO 14001 vb.',
    en: 'PDF, multiple · IATF, CE, ISO 14001 etc.',
    ja: 'PDF・複数可／IATF、CE、ISO 14001 など',
  },
  'up.financial': { tr: 'Mali Tablo Özeti', en: 'Financial Summary', ja: '財務概要' },
  'up.financial.meta': {
    tr: 'PDF · Son 2 yıllık ciro/bilanço özeti — gizli işlenir',
    en: 'PDF · Last 2 years revenue/balance summary — confidential',
    ja: 'PDF／直近2年の売上・貸借の概要（機密として扱います）',
  },
  'up.required': { tr: 'Zorunlu', en: 'Required', ja: '必須' },
  'up.optional': { tr: 'Opsiyonel', en: 'Optional', ja: '任意' },
  'up.uploaded': { tr: 'yüklendi', en: 'uploaded', ja: 'アップロード済み' },
  'up.remove': { tr: 'Kaldır', en: 'Remove', ja: '削除' },
  'up.hint': {
    tr: 'Dosya seçmek için tıklayın veya sürükleyip bırakın',
    en: 'Click to select a file or drag and drop',
    ja: 'クリックして選択、またはドラッグ＆ドロップ',
  },

  'consent.text': {
    tr: 'KVKK kapsamında kişisel verilerimin Yanmar Türkiye Makine Sanayi A.Ş. tarafından tedarikçi değerlendirme süreci için işlenmesini kabul ediyorum.',
    en: 'I consent to the processing of my personal data by Yanmar Türkiye Makine Sanayi A.Ş. for the supplier evaluation process under KVKK / GDPR.',
    ja: 'サプライヤー評価の目的で、Yanmar Türkiye Makine Sanayi A.Ş. が個人情報を取り扱うことに同意します（KVKK／GDPR に基づく）。',
  },
  'consent.link': { tr: 'Aydınlatma metni', en: 'Privacy notice', ja: 'プライバシーに関する説明' },
  'consent.error': {
    tr: 'Devam etmek için KVKK onayını işaretleyiniz.',
    en: 'Please tick the privacy consent to continue.',
    ja: '続行するには個人情報の取り扱いに同意してください。',
  },

  'btn.cancel': { tr: 'İptal', en: 'Cancel', ja: 'キャンセル' },
  'btn.submit': { tr: 'Başvuruyu gönder', en: 'Submit application', ja: '申請を送信' },
  'btn.submitting': { tr: 'Gönderiliyor...', en: 'Submitting...', ja: '送信中...' },
  'btn.close': { tr: 'Kapat', en: 'Close', ja: '閉じる' },
  'btn.send': { tr: 'Gönder', en: 'Send', ja: '送信' },
  'btn.query': { tr: 'Sorgula', en: 'Search', ja: '照会' },
  'btn.upload': { tr: 'Yükle', en: 'Upload', ja: 'アップロード' },
  'btn.signin': { tr: 'Giriş yap', en: 'Sign in', ja: 'ログイン' },
  'btn.open': { tr: 'Aç', en: 'Open', ja: '開く' },
  'btn.download': { tr: 'İndir', en: 'Download', ja: 'ダウンロード' },
  'btn.save': { tr: 'Kaydet', en: 'Save', ja: '保存' },
  'btn.give.up': { tr: 'Vazgeç', en: 'Discard', ja: '取消' },

  'progress.text': {
    tr: '{done} / {total} zorunlu alan dolduruldu',
    en: '{done} / {total} required fields completed',
    ja: '必須項目 {done} / {total} 入力済み',
  },
  'error.required': {
    tr: 'Lütfen zorunlu alanları doldurunuz.',
    en: 'Please complete the required fields.',
    ja: '必須項目をご記入ください。',
  },
  'error.categories': {
    tr: 'En az bir ürün grubu seçiniz.',
    en: 'Select at least one product group.',
    ja: '供給品目を1つ以上選択してください。',
  },
  'error.email': {
    tr: 'Geçerli bir e-posta adresi giriniz.',
    en: 'Please enter a valid email address.',
    ja: '有効なメールアドレスを入力してください。',
  },
  'error.document': {
    tr: 'Bu belge zorunludur.',
    en: 'This document is required.',
    ja: 'この書類は必須です。',
  },
  'error.tax.tr.format': {
    tr: 'Vergi numarası 10 haneli (VKN) veya 11 haneli (TCKN) olmalıdır.',
    en: 'The tax number must be 10 digits (VKN) or 11 digits (national ID).',
    ja: '納税者番号は10桁（VKN）または11桁（国民番号）である必要があります。',
  },
  'error.tax.tr.checksum': {
    tr: 'Vergi numarası doğrulanamadı. Lütfen kontrol ediniz.',
    en: 'The tax number failed verification. Please check it.',
    ja: '納税者番号を確認できませんでした。ご確認ください。',
  },
  'error.tax.format': {
    tr: 'Vergi / DUNS numarası geçersiz.',
    en: 'The tax / DUNS number is not valid.',
    ja: '納税者番号 / DUNS番号が正しくありません。',
  },
  'error.generic': {
    tr: 'Başvuru gönderilemedi. Lütfen tekrar deneyiniz.',
    en: 'The application could not be submitted. Please try again.',
    ja: '申請を送信できませんでした。もう一度お試しください。',
  },

  'success.title': { tr: 'Başvurunuz alındı', en: 'Application received', ja: '申請を受け付けました' },
  'success.message': {
    tr: 'Teşekkür ederiz. Başvurunuz Teknik Satınalma ekibimize iletildi. Onay e-postası birazdan adresinize ulaşacaktır.',
    en: 'Thank you. Your application has been forwarded to our Technical Procurement team. A confirmation email will be sent shortly.',
    ja: 'ありがとうございます。申請内容を技術調達チームへお送りしました。確認メールをまもなくお届けします。',
  },
  'success.ref': { tr: 'BAŞVURU REFERANS NO', en: 'APPLICATION REFERENCE NO', ja: '申請受付番号' },
  'success.next': { tr: 'Bundan sonra ne olacak?', en: 'What happens next?', ja: '今後の流れ' },
  'success.step1': {
    tr: 'Başvurunuz 10 iş günü içinde ön değerlendirmeden geçer.',
    en: 'Your application is pre-evaluated within 10 business days.',
    ja: '10営業日以内に一次評価を行います。',
  },
  'success.step2': {
    tr: 'Ziyaret / denetim planlaması yapılır.',
    en: 'A site visit / audit is scheduled.',
    ja: '訪問・監査の日程を調整します。',
  },
  'success.step3': {
    tr: 'Potansiyel RFQ süreçlerine davet edilirsiniz.',
    en: 'You are invited to potential RFQ processes.',
    ja: '見積依頼（RFQ）にご招待します。',
  },
  'success.track': {
    tr: 'Bu referans numarasını saklayınız; başvuru takip sayfasından durumunuzu sorgulayabilirsiniz.',
    en: 'Please keep this reference number; you can check your status on the tracking page.',
    ja: 'この受付番号は保管してください。申請状況の確認ページでいつでも進捗をご確認いただけます。',
  },

  // ---------------------------- Başvuru takibi ------------------------------
  'track.title': { tr: 'Başvuru Takibi', en: 'Application Tracking', ja: '申請状況の確認' },
  'track.subtitle': {
    tr: 'Referans numaranız ve başvuruda kullandığınız e-posta ile başvurunuzun güncel durumunu görebilirsiniz.',
    en: 'Check the current status of your application with your reference number and the email you applied with.',
    ja: '受付番号と申請時のメールアドレスで、現在の進捗をご確認いただけます。',
  },
  'track.ref': { tr: 'Başvuru referans no', en: 'Application reference no', ja: '申請受付番号' },
  'track.notfound': {
    tr: 'Bu referans numarası ve e-posta ile eşleşen bir başvuru bulunamadı.',
    en: 'No application matches this reference number and email address.',
    ja: 'この受付番号とメールアドレスに一致する申請は見つかりませんでした。',
  },
  'track.status': { tr: 'Başvuru durumu', en: 'Application status', ja: '申請ステータス' },
  'track.submitted': { tr: 'Başvuru tarihi', en: 'Submitted on', ja: '申請日' },
  'track.updated': { tr: 'Son güncelleme', en: 'Last updated', ja: '最終更新' },
  'track.messages': { tr: 'Yanmar ekibinden mesajlar', en: 'Messages from the Yanmar team', ja: 'ヤンマー担当者からのメッセージ' },
  'track.audit': { tr: 'Kalite denetimi', en: 'Quality audit', ja: '品質監査' },
  'track.step.1': { tr: 'Başvuru alındı', en: 'Application received', ja: '申請受付' },
  'track.step.2': { tr: 'Ön değerlendirme', en: 'Pre-evaluation', ja: '一次評価' },
  'track.step.3': { tr: 'Kalite denetimi', en: 'Quality audit', ja: '品質監査' },
  'track.step.4': { tr: 'Onaylı tedarikçi', en: 'Approved supplier', ja: '承認サプライヤー' },

  // --------------------------- Business Partner kapısı ----------------------
  'gate.title': { tr: 'Business Partner Portalı', en: 'Business Partner Portal', ja: 'ビジネスパートナーポータル' },
  'gate.lead': {
    tr: 'Tedarikçi başvuruları ve değerlendirme süreçleri için tek giriş noktası.',
    en: 'Single entry point for supplier applications and evaluation processes.',
    ja: 'サプライヤー申請と評価プロセスの統一窓口です。',
  },
  'gate.choice.apply': { tr: 'Başvuru yapmak istiyorum', en: 'I want to apply', ja: '申請したい' },
  'gate.choice.apply.sub': {
    tr: 'Yeni başvuru veya başvuru takibi',
    en: 'New application or track an existing one',
    ja: '新規申請または進捗確認',
  },
  'gate.choice.supplier': { tr: 'Onaylı tedarikçiyim', en: "I'm an approved supplier", ja: '承認サプライヤーです' },
  'gate.choice.supplier.sub': {
    tr: 'Portala girin: belge, uygunsuzluk, sözleşme',
    en: 'Sign in: documents, NCRs, contracts',
    ja: 'ログイン：書類・不適合・契約',
  },
  'gate.choice.team': { tr: 'Yanmar ekibiyim', en: "I'm from the Yanmar team", ja: 'ヤンマーの社員です' },
  'gate.choice.team.sub': { tr: 'Yönetim paneline giriş yapın', en: 'Sign in to the admin panel', ja: '管理パネルへログイン' },

  'gate.new.title': { tr: 'Yeni başvuru', en: 'New application', ja: '新規申請' },
  'gate.new.body': {
    tr: 'Firma bilgileriniz, üretim yetkinlikleriniz ve kalite belgelerinizle tedarikçi havuzumuza başvurun. Yaklaşık 5 dakika sürer.',
    en: 'Apply to our supplier pool with your company details, capabilities and quality certificates. Takes about 5 minutes.',
    ja: '会社情報、生産能力、品質認証をご記入のうえサプライヤー登録にお申し込みください。所要時間は約5分です。',
  },
  'gate.new.btn': { tr: 'Başvuru formunu aç', en: 'Open application form', ja: '申請フォームを開く' },
  'gate.or': { tr: 'veya', en: 'or', ja: 'または' },
  'gate.track.title': { tr: 'Başvurumu takip et', en: 'Track my application', ja: '申請状況を確認' },
  'gate.track.body': {
    tr: 'Daha önce başvurduysanız referans numaranız ve e-posta adresinizle durumunuzu görebilirsiniz.',
    en: 'If you have already applied, check your status with your reference number and email address.',
    ja: 'すでにお申し込みの方は、受付番号とメールアドレスで進捗をご確認いただけます。',
  },
  'gate.supplier.title': { tr: 'Onaylı tedarikçi girişi', en: 'Approved supplier sign-in', ja: '承認サプライヤーのログイン' },
  'gate.supplier.body': {
    tr: 'Denetimden geçip onaylanan tedarikçilerimiz içindir. Parolanızı, onay e-postasındaki bağlantıdan kendiniz belirlersiniz.',
    en: 'For suppliers who passed the audit. You set your own password via the link in the approval email.',
    ja: '監査を通過した承認サプライヤー向けです。パスワードは承認メールのリンクからご自身で設定していただきます。',
  },
  'gate.forgot': {
    tr: 'Parolamı unuttum / henüz oluşturmadım',
    en: 'Forgot password / not set yet',
    ja: 'パスワードをお忘れの方・未設定の方',
  },
  'gate.team.title': { tr: 'Yönetim paneli girişi', en: 'Admin panel sign-in', ja: '管理パネルへのログイン' },
  'gate.team.body': {
    tr: 'Satınalma ve Kalite ekipleri için. Tedarikçilerin giriş yapmasına gerek yoktur.',
    en: 'For the Procurement and Quality teams. Suppliers do not need an account.',
    ja: '調達・品質チーム向けです。サプライヤーの方はログイン不要です。',
  },
  'gate.demo.staff': { tr: 'Demo hesapları', en: 'Demo accounts', ja: 'デモ用アカウント' },
  'gate.demo.suppliers': { tr: 'Demo tedarikçi hesapları', en: 'Demo supplier accounts', ja: 'デモ用サプライヤーアカウント' },
  'gate.demo.hint': {
    tr: ' — satıra tıklayın, alanlar dolsun',
    en: ' — click a row to fill the fields',
    ja: '（行をクリックすると入力欄に反映されます）',
  },
  'gate.demo.note': {
    tr: 'Bu hesaplar yalnızca demo verisi içindir. Gerçek tedarikçiler parolalarını onay e-postasındaki bağlantıdan kendileri belirler; parolasını değiştiren tedarikçi bu listede görünmez.',
    en: 'These accounts exist only in demo data. Real suppliers set their own password from the approval email; a supplier who changes it disappears from this list.',
    ja: 'これらはデモデータ専用のアカウントです。実際のサプライヤーは承認メールのリンクからご自身でパスワードを設定します。パスワードを変更したサプライヤーはこの一覧に表示されません。',
  },
  'gate.err.login': { tr: 'Giriş yapılamadı.', en: 'Sign-in failed.', ja: 'ログインできませんでした。' },
  'gate.err.email.first': {
    tr: 'Önce e-posta adresinizi yazın.',
    en: 'Please enter your email address first.',
    ja: '先にメールアドレスをご入力ください。',
  },
  'gate.err.failed': { tr: 'İşlem başarısız.', en: 'The operation failed.', ja: '処理に失敗しました。' },

  // -------------------------- Parola belirleme ekranı -----------------------
  'pw.link.invalid': { tr: 'Bağlantı geçersiz', en: 'Invalid link', ja: 'リンクが無効です' },
  'pw.link.error': {
    tr: 'Bağlantı doğrulanamadı.',
    en: 'The link could not be verified.',
    ja: 'リンクを確認できませんでした。',
  },
  'pw.goto.login': { tr: 'Giriş ekranına git', en: 'Go to the sign-in page', ja: 'ログイン画面へ' },
  'pw.done.title': { tr: 'Parolanız oluşturuldu', en: 'Your password is set', ja: 'パスワードを設定しました' },
  'pw.done.body': {
    tr: 'Giriş ekranına yönlendiriliyorsunuz...',
    en: 'Redirecting you to the sign-in page...',
    ja: 'ログイン画面へ移動します...',
  },
  'pw.done.btn': { tr: 'Şimdi giriş yap', en: 'Sign in now', ja: '今すぐログイン' },
  'pw.create.title': { tr: 'Portal parolanızı oluşturun', en: 'Create your portal password', ja: 'ポータルのパスワードを設定' },
  'pw.reset.title': { tr: 'Parolanızı yenileyin', en: 'Reset your password', ja: 'パスワードを再設定' },
  'pw.lead': {
    tr: '{company} ({code}) için tedarikçi portalı erişimi.',
    en: 'Supplier portal access for {company} ({code}).',
    ja: '{company}（{code}）のサプライヤーポータルへのアクセス。',
  },
  'pw.email.label': { tr: 'Giriş e-postanız', en: 'Your sign-in email', ja: 'ログイン用メールアドレス' },
  'pw.email.hint': {
    tr: 'Portala bu adresle gireceksiniz.',
    en: 'You will sign in to the portal with this address.',
    ja: 'このアドレスでポータルにログインします。',
  },
  'pw.confirm': { tr: 'Parola (tekrar)', en: 'Password (repeat)', ja: 'パスワード（確認）' },
  'pw.rule': {
    tr: 'En az 8 karakter, harf ve rakam içermeli.',
    en: 'At least 8 characters, including a letter and a digit.',
    ja: '8文字以上で、英字と数字を含めてください。',
  },
  'pw.create.btn': { tr: 'Parolamı oluştur', en: 'Create my password', ja: 'パスワードを設定' },
  'pw.reset.btn': { tr: 'Parolamı yenile', en: 'Reset my password', ja: 'パスワードを再設定' },
  'pw.mismatch': { tr: 'Parolalar eşleşmiyor.', en: 'The passwords do not match.', ja: 'パスワードが一致しません。' },
  'pw.create.error': {
    tr: 'Parola oluşturulamadı.',
    en: 'The password could not be created.',
    ja: 'パスワードを設定できませんでした。',
  },

  // --------------------------- Onaylı tedarikçi portalı ---------------------
  'sp.title': { tr: 'Tedarikçi Portalı', en: 'Supplier Portal', ja: 'サプライヤーポータル' },
  'sp.logout': { tr: 'Çıkış', en: 'Sign out', ja: 'ログアウト' },
  'sp.grade': { tr: 'Kalite notunuz:', en: 'Your quality grade:', ja: '品質評価：' },
  'sp.pending': {
    tr: '{count} uygunsuzluk cevabınızı bekliyor',
    en: '{count} non-conformance report(s) awaiting your response',
    ja: '{count} 件の不適合が回答待ちです',
  },
  'sp.tab.summary': { tr: 'Özet', en: 'Overview', ja: '概要' },
  'sp.tab.ncr': { tr: 'Uygunsuzluklar', en: 'Non-conformances', ja: '不適合' },
  'sp.tab.docs': { tr: 'Belgeler', en: 'Documents', ja: '書類' },
  'sp.tab.contracts': { tr: 'Sözleşmeler', en: 'Contracts', ja: '契約' },
  'sp.tab.mail': { tr: 'Yazışmalar', en: 'Messages', ja: 'やり取り' },

  'sp.kv.company': { tr: 'Firma', en: 'Company', ja: '会社名' },
  'sp.kv.code': { tr: 'Tedarikçi kodu', en: 'Supplier code', ja: 'サプライヤーコード' },
  'sp.kv.tax': { tr: 'Vergi no', en: 'Tax number', ja: '法人番号' },
  'sp.kv.contact': { tr: 'Yetkili', en: 'Contact', ja: 'ご担当者' },
  'sp.kv.approved': { tr: 'Onay tarihi', en: 'Approved on', ja: '承認日' },
  'sp.kv.next.audit': { tr: 'Sonraki denetim', en: 'Next audit', ja: '次回監査' },
  'sp.kv.otd': { tr: 'Zamanında teslimat', en: 'On-time delivery', ja: '納期遵守率' },
  'sp.kv.ppm': { tr: 'PPM', en: 'PPM', ja: 'PPM（不良率）' },
  'sp.messages': { tr: 'Yanmar ekibinden mesajlar', en: 'Messages from the Yanmar team', ja: 'ヤンマー担当者からのメッセージ' },

  'sp.ncr.empty': {
    tr: 'Firmanıza açılmış bir uygunsuzluk kaydı yok.',
    en: 'There are no non-conformance reports for your company.',
    ja: '貴社に対する不適合の記録はありません。',
  },
  'sp.ncr.category': { tr: 'Kategori', en: 'Category', ja: '区分' },
  'sp.ncr.part': { tr: 'Parça', en: 'Part', ja: '部品番号' },
  'sp.ncr.qty': { tr: 'Adet', en: 'Quantity', ja: '数量' },
  'sp.ncr.due': { tr: 'Son cevap', en: 'Response due', ja: '回答期限' },
  'sp.ncr.overdue': { tr: 'Termin geçti', en: 'Overdue', ja: '期限超過' },
  'sp.ncr.answer': { tr: 'Gönderdiğiniz cevap', en: 'The response you submitted', ja: 'ご提出いただいた回答' },
  'sp.ncr.root': { tr: 'Kök neden', en: 'Root cause', ja: '根本原因' },
  'sp.ncr.corrective': { tr: 'Düzeltici faaliyet', en: 'Corrective action', ja: '是正処置' },
  'sp.ncr.respond': { tr: 'Düzeltici faaliyet gir (8D)', en: 'Submit corrective action (8D)', ja: '是正処置を入力（8D）' },
  'sp.ncr.resend': { tr: 'Cevabı yeniden gönder', en: 'Resubmit the response', ja: '回答を再提出' },
  'sp.ncr.modal': { tr: 'Düzeltici faaliyet', en: 'Corrective action', ja: '是正処置' },

  'sp.8d.containment': { tr: 'Acil önlem (D3)', en: 'Containment action (D3)', ja: '応急処置（D3）' },
  'sp.8d.containment.ph': {
    tr: 'Etkilenen ürünler için aldığınız acil önlemler...',
    en: 'Immediate measures taken for the affected products...',
    ja: '対象製品に対して実施した応急処置をご記入ください',
  },
  'sp.8d.root': { tr: 'Kök neden analizi (D4)', en: 'Root cause analysis (D4)', ja: '根本原因分析（D4）' },
  'sp.8d.root.ph': {
    tr: '5 neden / balık kılçığı analizi sonucu tespit edilen kök neden...',
    en: 'Root cause identified through 5-why / fishbone analysis...',
    ja: 'なぜなぜ分析・特性要因図で特定した根本原因をご記入ください',
  },
  'sp.8d.corrective': { tr: 'Düzeltici faaliyet (D5-D6)', en: 'Corrective action (D5-D6)', ja: '是正処置（D5-D6）' },
  'sp.8d.corrective.ph': {
    tr: 'Kök nedeni ortadan kaldıracak faaliyetler ve termin tarihleri...',
    en: 'Actions that eliminate the root cause and their target dates...',
    ja: '根本原因を除去する対策と実施期限をご記入ください',
  },
  'sp.8d.preventive': { tr: 'Önleyici faaliyet (D7)', en: 'Preventive action (D7)', ja: '予防処置（D7）' },
  'sp.8d.preventive.ph': {
    tr: 'Tekrarını önleyecek sistemsel iyileştirmeler...',
    en: 'Systemic improvements that prevent recurrence...',
    ja: '再発を防ぐ仕組み上の改善をご記入ください',
  },

  'sp.doc.upload': { tr: 'Belge yükle', en: 'Upload a document', ja: '書類をアップロード' },
  'sp.doc.pick': { tr: 'Dosya seçin', en: 'Select a file', ja: 'ファイルを選択' },
  'sp.doc.meta': {
    tr: 'PDF, Office belgeleri, görseller · max 20 MB',
    en: 'PDF, Office documents, images · max 20 MB',
    ja: 'PDF・Office文書・画像／最大20MB',
  },
  'sp.doc.list': { tr: 'Belgeler', en: 'Documents', ja: '書類' },
  'sp.doc.empty': { tr: 'Henüz belge yok.', en: 'No documents yet.', ja: 'まだ書類はありません。' },
  'sp.doc.mine': { tr: 'sizin yüklediğiniz', en: 'uploaded by you', ja: '貴社アップロード' },
  'sp.doc.theirs': { tr: 'Yanmar paylaştı', en: 'shared by Yanmar', ja: 'ヤンマー提供' },
  'sp.contract.empty': { tr: 'Kayıtlı sözleşme yok.', en: 'No contracts on record.', ja: '登録されている契約はありません。' },

  'sp.box.in': { tr: 'Gelen', en: 'Inbox', ja: '受信' },
  'sp.box.out': { tr: 'Gönderilen', en: 'Sent', ja: '送信' },
  'sp.box.in.hint': {
    tr: "Yanmar'ın firmanıza gönderdiği bildirimler.",
    en: 'Notifications Yanmar has sent to your company.',
    ja: 'ヤンマーから貴社へお送りした通知です。',
  },
  'sp.box.out.hint': {
    tr: "Portal üzerinden Yanmar'a gönderdikleriniz.",
    en: 'What you have submitted to Yanmar through the portal.',
    ja: 'ポータルからヤンマーへご提出いただいた内容です。',
  },
  'sp.box.in.empty': { tr: 'Henüz bildirim yok.', en: 'No notifications yet.', ja: 'まだ通知はありません。' },
  'sp.box.out.empty': { tr: 'Henüz bir gönderiminiz yok.', en: 'You have not submitted anything yet.', ja: 'まだご提出はありません。' },
  'sp.sub.doc': { tr: 'Belge gönderdiniz', en: 'You submitted a document', ja: '書類を提出しました' },
  'sp.sub.ncr': {
    tr: 'Düzeltici faaliyet planı gönderdiniz',
    en: 'You submitted a corrective action plan',
    ja: '是正処置計画を提出しました',
  },

  'sp.pw.title': { tr: 'Parola değiştir', en: 'Change password', ja: 'パスワードの変更' },
  'sp.pw.btn': { tr: 'Parola', en: 'Password', ja: 'パスワード' },
  'sp.pw.current': { tr: 'Mevcut parola', en: 'Current password', ja: '現在のパスワード' },
  'sp.pw.new': { tr: 'Yeni parola', en: 'New password', ja: '新しいパスワード' },

  'sp.toast.uploaded': {
    tr: 'Belgeleriniz yüklendi, Yanmar ekibine iletildi.',
    en: 'Your documents were uploaded and forwarded to the Yanmar team.',
    ja: '書類をアップロードし、ヤンマー担当者へお送りしました。',
  },
  'sp.toast.upload.failed': { tr: 'Yükleme başarısız.', en: 'The upload failed.', ja: 'アップロードに失敗しました。' },
  'sp.toast.ncr.sent': {
    tr: 'Düzeltici faaliyet planınız iletildi.',
    en: 'Your corrective action plan has been submitted.',
    ja: '是正処置計画を送信しました。',
  },
  'sp.toast.failed': { tr: 'Gönderilemedi.', en: 'Could not be sent.', ja: '送信できませんでした。' },
  'sp.toast.pw.updated': { tr: 'Parolanız güncellendi.', en: 'Your password has been updated.', ja: 'パスワードを更新しました。' },
  'sp.toast.pw.failed': { tr: 'Güncellenemedi.', en: 'The update failed.', ja: '更新できませんでした。' },

  // ------------------------- E-posta önizleme bağlantıları ------------------
  'mail.preview': { tr: 'E-posta önizleme', en: 'Email preview', ja: 'メールのプレビュー' },
  'mail.links.title': { tr: 'E-postadaki bağlantılar', en: 'Links in this email', ja: 'メール内のリンク' },
  'mail.links.note': {
    tr: 'Önizleme güvenlik için kısıtlı bir çerçevede gösterilir; bağlantıları buradan açabilirsiniz.',
    en: 'The preview runs in a restricted frame for safety; open the links from here.',
    ja: 'プレビューは安全のため制限付きの枠内で表示されます。リンクはこちらから開いてください。',
  },

  // ------------------------ Süreli bağlantı self-servis ---------------------
  'portal.title': { tr: 'Tedarikçi Self-Servis Alanı', en: 'Supplier Self-Service Area', ja: 'サプライヤー専用ページ' },
  'portal.docs': { tr: 'Belgeler', en: 'Documents', ja: '書類' },
  'portal.upload': { tr: 'Belge yükle', en: 'Upload document', ja: '書類をアップロード' },
  'portal.message': { tr: 'Mesajınız', en: 'Your message', ja: 'メッセージ' },
  'portal.message.ph': {
    tr: 'Yanmar ekibine iletmek istediğiniz açıklama...',
    en: 'A note you would like to pass to the Yanmar team...',
    ja: 'ヤンマー担当者へお伝えしたい内容をご記入ください',
  },
  'portal.ncr.title': {
    tr: 'Uygunsuzluk Raporu — Düzeltici Faaliyet',
    en: 'Non-Conformance Report — Corrective Action',
    ja: '不適合報告書 — 是正処置',
  },
  'portal.ncr.containment': { tr: 'Acil önlem (containment)', en: 'Containment action', ja: '応急処置（封じ込め）' },
  'portal.ncr.root': { tr: 'Kök neden analizi', en: 'Root cause analysis', ja: '根本原因分析' },
  'portal.ncr.corrective': { tr: 'Düzeltici faaliyet', en: 'Corrective action', ja: '是正処置' },
  'portal.ncr.preventive': { tr: 'Önleyici faaliyet', en: 'Preventive action', ja: '予防処置' },
  'portal.ncr.submit': { tr: 'Cevabı gönder', en: 'Submit response', ja: '回答を送信' },
  'portal.part': { tr: 'Parça no', en: 'Part no', ja: '部品番号' },
  'portal.qty': { tr: 'Etkilenen adet', en: 'Affected quantity', ja: '対象数量' },
  'portal.due': { tr: 'Son cevap tarihi', en: 'Response due date', ja: '回答期限' },
  'portal.expired': {
    tr: 'Bu bağlantının süresi dolmuş veya geçersiz.',
    en: 'This link has expired or is invalid.',
    ja: 'このリンクは有効期限が切れているか無効です。',
  },
  'portal.sent': {
    tr: 'Cevabınız iletildi. Kalite birimimiz inceleyecektir.',
    en: 'Your response has been submitted. Our quality team will review it.',
    ja: '回答を送信しました。品質部門にて確認いたします。',
  },
  'portal.toast.uploaded': { tr: 'Belgeleriniz yüklendi.', en: 'Your documents were uploaded.', ja: '書類をアップロードしました。' },
  'portal.toast.message': { tr: 'Mesajınız iletildi.', en: 'Your message has been sent.', ja: 'メッセージを送信しました。' },

  // ------------------------------ Ortak arayüz ------------------------------
  'ui.loading': { tr: 'Yükleniyor...', en: 'Loading...', ja: '読み込み中...' },
  'ui.prev': { tr: '‹ Önceki', en: '‹ Previous', ja: '‹ 前へ' },
  'ui.next': { tr: 'Sonraki ›', en: 'Next ›', ja: '次へ ›' },
  'ui.pagination': {
    tr: 'Toplam {total} kayıt · sayfa {page}/{pageCount}',
    en: '{total} records in total · page {page}/{pageCount}',
    ja: '全 {total} 件 · {page}/{pageCount} ページ',
  },

  'app.title': {
    tr: 'Yanmar Türkiye — Business Partner Portalı',
    en: 'Yanmar Türkiye — Business Partner Portal',
    ja: 'ヤンマートルコ — ビジネスパートナーポータル',
  },
  'footer.text': {
    tr: '© 2026 Yanmar Türkiye Makine Sanayi A.Ş. · Business Partner Portalı',
    en: '© 2026 Yanmar Türkiye Makine Sanayi A.Ş. · Business Partner Portal',
    ja: '© 2026 Yanmar Türkiye Makine Sanayi A.Ş. · ビジネスパートナーポータル',
  },
} satisfies Record<string, Entry>;

const dict = { ...publicDict, ...adminDict };

export type TranslationKey = keyof typeof dict;

/** Sunucudan gelen çok dilli referans kaydı (ürün grubu, sertifika, sektör). */
type MultiLangRow = {
  name_tr?: string; name_en?: string; name_ja?: string | null;
  hint_tr?: string | null; hint_en?: string | null; hint_ja?: string | null;
};

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /**
   * Sunucudan gelen (derleme anında bilinmeyen) anahtarlar için. Anahtar
   * sözlükte yoksa `fallback` gösterilir — böylece sunucu yeni bir görev türü
   * yazdığında arayüz boş kalmaz.
   */
  tKey: (key: string | null | undefined, fallback: string, vars?: Record<string, string | number>) => string;
  /** Sunucudan gelen çok dilli kayıtlar için yardımcı. */
  pick: (row: MultiLangRow, field?: 'name' | 'hint') => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function isLang(value: string | null): value is Lang {
  return value === 'tr' || value === 'en' || value === 'ja';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('bp_lang');
    return isLang(stored) ? stored : 'tr';
  });

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem('bp_lang', next);
  }, []);

  /**
   * Belgenin dili ve başlığı seçili dile göre güncellenir — ilk yüklemede de
   * çalışır, böylece kayıtlı tercihi Japonca olan ziyaretçide <html lang> doğru
   * olur (ekran okuyucular ve CJK font seçimi bunu kullanır).
   */
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = dict['app.title'][lang];
  }, [lang]);

  const t = useCallback<I18nValue['t']>(
    (key, vars) => {
      let text: string = dict[key][lang];
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replaceAll(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [lang],
  );

  const tKey = useCallback<I18nValue['tKey']>(
    (key, fallback, vars) => {
      if (!key || !(key in dict)) return fallback;
      return t(key as TranslationKey, vars);
    },
    [t],
  );

  /**
   * Japonca içerik sonradan eklenebildiği için sırayla düşer:
   * seçili dil → İngilizce → Türkçe. Böylece yeni bir ürün grubu eklendiğinde
   * Japonca karşılığı girilene kadar ekranda boşluk görünmez.
   */
  const pick = useCallback<I18nValue['pick']>(
    (row, field = 'name') => {
      const order: Lang[] = lang === 'tr' ? ['tr', 'en'] : [lang, 'en', 'tr'];
      for (const code of order) {
        const value = row[`${field}_${code}` as keyof MultiLangRow];
        if (typeof value === 'string' && value.trim()) return value;
      }
      return '';
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, tKey, pick }), [lang, setLang, t, tKey, pick]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
