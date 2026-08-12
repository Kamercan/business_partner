/**
 * Tedarikçiye giden e-posta metinleri — Türkçe, İngilizce, Japonca.
 *
 * Başvuru hangi dilde yapıldıysa bildirimler de o dilde gider (`applications.lang`,
 * onaydan sonra `suppliers.lang`). Yanmar ekibine giden iç bildirimler bu
 * dosyanın kapsamında değildir; onlar Türkçedir.
 *
 * Arayüz sözlüğüyle aynı mantık: her anahtarın üç dili yan yana durur, biri
 * eksik kalırsa derleme hatası verir.
 */

export type MailLang = 'tr' | 'en' | 'ja';

type Entry = { tr: string; en: string; ja: string };

const text = {
  // ------------------------------ Ortak parçalar ----------------------------
  'greeting.person': { tr: 'Sayın {name},', en: 'Dear {name},', ja: '{name} 様' },
  'greeting.company': {
    tr: 'Sayın yetkili ({company}),',
    en: 'Dear Sir or Madam ({company}),',
    ja: '{company} ご担当者様',
  },
  'kv.ref': { tr: 'Başvuru referans no', en: 'Application reference no', ja: '申請受付番号' },
  'kv.company': { tr: 'Firma', en: 'Company', ja: '会社名' },
  'kv.login.email': { tr: 'Giriş e-postası', en: 'Sign-in email', ja: 'ログイン用メールアドレス' },
  'kv.ncr.no': { tr: 'Rapor no', en: 'Report no', ja: '報告書番号' },
  'kv.ncr.subject': { tr: 'Konu', en: 'Subject', ja: '件名' },
  'kv.ncr.severity': { tr: 'Önem derecesi', en: 'Severity', ja: '重要度' },
  'kv.ncr.due': { tr: 'Son cevap tarihi', en: 'Response due date', ja: '回答期限' },
  'note.extra': { tr: 'Ek not:', en: 'Additional note:', ja: '補足：' },
  'footer': {
    tr: 'Bu e-posta Yanmar Türkiye Business Partner Portalı tarafından otomatik olarak gönderilmiştir.',
    en: 'This email was sent automatically by the Yanmar Türkiye Business Partner Portal.',
    ja: 'このメールはヤンマートルコ ビジネスパートナーポータルより自動送信されています。',
  },
  'btn.track': { tr: 'Başvuru durumunu görüntüle', en: 'View application status', ja: '申請状況を確認する' },

  'severity.MINOR': { tr: 'Küçük', en: 'Minor', ja: '軽微' },
  'severity.MAJOR': { tr: 'Büyük', en: 'Major', ja: '重大' },
  'severity.CRITICAL': { tr: 'Kritik', en: 'Critical', ja: '致命的' },

  // --------------------------- Başvuru alındı -------------------------------
  'received.subject': {
    tr: 'Başvurunuz alındı — {ref}',
    en: 'We have received your application — {ref}',
    ja: '申請を受け付けました — {ref}',
  },
  'received.title': { tr: 'Başvurunuz alındı', en: 'Application received', ja: '申請を受け付けました' },
  'received.body': {
    tr: '<strong>{company}</strong> adına yaptığınız tedarikçi başvurusu sistemimize ulaşmıştır. Başvurunuz Teknik Satınalma ve Kaynak Geliştirme ekibimiz tarafından değerlendirilecek ve 10 iş günü içinde tarafınıza dönüş yapılacaktır.',
    en: 'Your supplier application on behalf of <strong>{company}</strong> has reached us. It will be evaluated by our Technical Procurement and Sourcing team, and we will get back to you within 10 business days.',
    ja: '<strong>{company}</strong> 様よりお申し込みいただいたサプライヤー申請を受け付けました。技術調達・ソーシングチームにて内容を確認し、10営業日以内にご連絡いたします。',
  },
  'received.track': {
    tr: 'Başvurunuzun güncel durumunu aşağıdaki bağlantıdan referans numaranız ve e-posta adresinizle takip edebilirsiniz.',
    en: 'You can follow the current status of your application with your reference number and email address using the link below.',
    ja: '下のリンクから、受付番号とメールアドレスで申請の進捗をご確認いただけます。',
  },

  // ------------------------- Durum değişiklikleri ---------------------------
  'status.AUDIT_PENDING.subject': {
    tr: 'Başvurunuz ön değerlendirmeyi geçti — {ref}',
    en: 'Your application passed the pre-evaluation — {ref}',
    ja: '一次評価を通過しました — {ref}',
  },
  'status.AUDIT_PENDING.title': {
    tr: 'Başvurunuz ön değerlendirmeyi geçti',
    en: 'Your application passed the pre-evaluation',
    ja: '一次評価を通過しました',
  },
  'status.AUDIT_PENDING.body': {
    tr: 'Başvurunuz Teknik Satınalma ekibimizin ön değerlendirmesini başarıyla geçmiştir. Sıradaki adım Kalite Güvence birimimizin tedarikçi denetimidir; denetim planlaması için kısa süre içinde sizinle iletişime geçilecektir.',
    en: 'Your application has successfully passed the pre-evaluation by our Technical Procurement team. The next step is a supplier audit by our Quality Assurance unit; we will contact you shortly to schedule it.',
    ja: '技術調達チームによる一次評価を通過されました。次の段階は品質保証部門によるサプライヤー監査です。日程調整のため、近日中にご連絡いたします。',
  },
  'status.AUDIT_PLANNED.subject': {
    tr: 'Tedarikçi denetiminiz planlandı — {ref}',
    en: 'Your supplier audit has been scheduled — {ref}',
    ja: 'サプライヤー監査の日程が決まりました — {ref}',
  },
  'status.AUDIT_PLANNED.title': {
    tr: 'Tedarikçi denetiminiz planlandı',
    en: 'Your supplier audit has been scheduled',
    ja: 'サプライヤー監査の日程が決まりました',
  },
  'status.AUDIT_PLANNED.body': {
    tr: 'Kalite Güvence birimimiz firmanız için bir denetim planlamıştır. Denetim tarihi ve kapsamı için ekibimiz sizinle iletişime geçecektir.',
    en: 'Our Quality Assurance unit has scheduled an audit for your company. Our team will contact you regarding the date and scope.',
    ja: '品質保証部門にて貴社の監査を計画いたしました。実施日と範囲については担当者よりご連絡いたします。',
  },
  'status.APPROVED.subject': {
    tr: 'Tebrikler — onaylı tedarikçi havuzumuza katıldınız ({ref})',
    en: 'Congratulations — you have joined our approved supplier pool ({ref})',
    ja: 'おめでとうございます — 承認サプライヤーに登録されました（{ref}）',
  },
  'status.APPROVED.title': {
    tr: 'Onaylı tedarikçi havuzumuza katıldınız',
    en: 'You have joined our approved supplier pool',
    ja: '承認サプライヤーに登録されました',
  },
  'status.APPROVED.body': {
    tr: 'Denetim süreciniz başarıyla tamamlanmıştır. Firmanız Yanmar Türkiye onaylı tedarikçi havuzuna eklenmiştir. Bundan sonra ilgili ürün gruplarındaki teklif (RFQ) süreçlerimize davet edileceksiniz.',
    en: 'Your audit process has been completed successfully. Your company has been added to the Yanmar Türkiye approved supplier pool. From now on you will be invited to our quotation (RFQ) processes in the relevant product groups.',
    ja: '監査が無事に完了いたしました。貴社をヤンマートルコの承認サプライヤーとして登録いたしました。今後、該当品目の見積依頼（RFQ）にご招待いたします。',
  },
  'status.REJECTED.subject': {
    tr: 'Başvurunuz hakkında — {ref}',
    en: 'Regarding your application — {ref}',
    ja: 'ご申請の結果について — {ref}',
  },
  'status.REJECTED.title': { tr: 'Başvurunuz hakkında', en: 'Regarding your application', ja: 'ご申請の結果について' },
  'status.REJECTED.body': {
    tr: 'Başvurunuzu değerlendirdik. Mevcut tedarik ihtiyaçlarımız ve değerlendirme kriterlerimiz doğrultusunda başvurunuz bu aşamada olumlu sonuçlanmamıştır. İlginiz için teşekkür ederiz; ihtiyaçlarımız değiştiğinde başvurunuz havuzumuzda değerlendirilmeye devam edecektir.',
    en: 'We have reviewed your application. In line with our current sourcing needs and evaluation criteria, we are unable to take it forward at this stage. Thank you for your interest; your application remains in our pool and will be reconsidered as our needs change.',
    ja: 'ご申請の内容を確認いたしました。現在の調達ニーズおよび評価基準に照らし、今回は見送らせていただくこととなりました。ご関心をお寄せいただきありがとうございます。今後ニーズが変化した際には、改めて検討させていただきます。',
  },
  'status.DISQUALIFIED.subject': {
    tr: 'Denetim sonucunuz hakkında — {ref}',
    en: 'Regarding your audit result — {ref}',
    ja: '監査結果について — {ref}',
  },
  'status.DISQUALIFIED.title': {
    tr: 'Denetim sonucunuz hakkında',
    en: 'Regarding your audit result',
    ja: '監査結果について',
  },
  'status.DISQUALIFIED.body': {
    tr: 'Gerçekleştirilen tedarikçi denetimi sonucunda firmanız bu aşamada onaylı tedarikçi kriterlerimizi karşılamamıştır. Denetim raporundaki iyileştirme alanlarını tamamladıktan sonra yeniden başvurabilirsiniz.',
    en: 'Following the supplier audit, your company does not meet our approved-supplier criteria at this stage. You are welcome to apply again once the improvement areas listed in the audit report have been addressed.',
    ja: '実施したサプライヤー監査の結果、現時点では承認サプライヤーの基準を満たしていないと判断いたしました。監査報告書に記載の改善項目にご対応いただいたうえで、改めてお申し込みいただけます。',
  },
  'status.ON_HOLD.subject': {
    tr: 'Başvurunuz beklemeye alındı — {ref}',
    en: 'Your application is on hold — {ref}',
    ja: 'ご申請を保留とさせていただきました — {ref}',
  },
  'status.ON_HOLD.title': {
    tr: 'Başvurunuz beklemeye alındı',
    en: 'Your application is on hold',
    ja: 'ご申請を保留とさせていただきました',
  },
  'status.ON_HOLD.body': {
    tr: 'Başvurunuz kayıt altına alınmış olup, ilgili ürün grubunda tedarik ihtiyacı doğduğunda yeniden değerlendirilmek üzere havuzumuzda bekletilmektedir.',
    en: 'Your application has been recorded and is being kept in our pool, to be reconsidered when a sourcing need arises in the relevant product group.',
    ja: 'ご申請は登録済みです。該当品目で調達ニーズが生じた際に、改めて検討させていただきます。',
  },

  // ---------------------------- Bilgi / belge talebi ------------------------
  'info.subject': {
    tr: 'Başvurunuz için ek bilgi talebi — {ref}',
    en: 'Additional information required for your application — {ref}',
    ja: 'ご申請に関する追加情報のお願い — {ref}',
  },
  'info.title': { tr: 'Ek bilgi / belge talebi', en: 'Request for information / documents', ja: '追加情報・書類のお願い' },
  'info.body': {
    tr: '<strong>{ref}</strong> numaralı başvurunuzun değerlendirilebilmesi için aşağıdaki bilgi ve belgelere ihtiyacımız bulunmaktadır:',
    en: 'In order to evaluate your application <strong>{ref}</strong>, we need the following information and documents:',
    ja: '受付番号 <strong>{ref}</strong> のご申請を審査するにあたり、以下の情報・書類をお願いいたします。',
  },
  'info.link': {
    tr: 'Aşağıdaki güvenli bağlantı üzerinden belgelerinizi yükleyebilirsiniz. Bağlantı 30 gün geçerlidir ve yalnızca sizin başvurunuza erişim sağlar.',
    en: 'You can upload your documents through the secure link below. The link is valid for 30 days and gives access only to your own application.',
    ja: '下記の安全なリンクから書類をアップロードいただけます。リンクの有効期限は30日で、貴社のご申請のみにアクセスできます。',
  },
  'info.btn': { tr: 'Belge yükle', en: 'Upload documents', ja: '書類をアップロード' },

  // ------------------------------ Portal daveti -----------------------------
  'portal.invite.subject': {
    tr: 'Tedarikçi portalı erişiminiz hazır',
    en: 'Your supplier portal access is ready',
    ja: 'サプライヤーポータルのご利用準備が整いました',
  },
  'portal.reset.subject': {
    tr: 'Tedarikçi portalı — parola yenileme',
    en: 'Supplier portal — password reset',
    ja: 'サプライヤーポータル — パスワードの再設定',
  },
  'portal.invite.title': {
    tr: 'Tedarikçi portalı erişiminiz hazır',
    en: 'Your supplier portal access is ready',
    ja: 'サプライヤーポータルのご利用準備が整いました',
  },
  'portal.reset.title': { tr: 'Parolanızı yenileyin', en: 'Reset your password', ja: 'パスワードを再設定してください' },
  'portal.invite.body': {
    tr: 'Firmanız Yanmar Türkiye onaylı tedarikçi havuzuna eklenmiştir. Tedarikçi portalına erişmek için aşağıdaki bağlantıdan <strong>kendi parolanızı belirleyin</strong>.',
    en: 'Your company has been added to the Yanmar Türkiye approved supplier pool. Use the link below to <strong>set your own password</strong> and access the supplier portal.',
    ja: '貴社をヤンマートルコの承認サプライヤーとして登録いたしました。下のリンクから<strong>パスワードをご自身で設定</strong>のうえ、サプライヤーポータルをご利用ください。',
  },
  'portal.reset.body': {
    tr: 'Tedarikçi portalı parolanızı yenilemek için aşağıdaki bağlantıyı kullanabilirsiniz.',
    en: 'You can use the link below to reset your supplier portal password.',
    ja: 'サプライヤーポータルのパスワードは、下のリンクから再設定いただけます。',
  },
  'portal.what': {
    tr: 'Portal üzerinden belge yükleyebilir, uygunsuzluk raporlarına düzeltici faaliyet cevabı girebilir ve sözleşmelerinizi görüntüleyebilirsiniz.',
    en: 'Through the portal you can upload documents, submit corrective action responses to non-conformance reports and view your contracts.',
    ja: 'ポータルでは、書類のアップロード、不適合報告書への是正処置の回答、契約内容のご確認が可能です。',
  },
  'portal.invite.btn': { tr: 'Parolamı oluştur', en: 'Create my password', ja: 'パスワードを設定する' },
  'portal.reset.btn': { tr: 'Parolamı yenile', en: 'Reset my password', ja: 'パスワードを再設定する' },
  'portal.validity': {
    tr: 'Bu bağlantı {days} geçerlidir ve yalnızca bir kez kullanılabilir. Parolanızı oluşturduktan sonra portala <a href="{url}" style="color:#E60012;">buradan</a> girebilirsiniz.',
    en: 'This link is valid for {days} and can be used only once. Once your password is set you can sign in to the portal <a href="{url}" style="color:#E60012;">here</a>.',
    ja: 'このリンクの有効期限は{days}で、一度のみご利用いただけます。パスワード設定後は<a href="{url}" style="color:#E60012;">こちら</a>からポータルにログインしてください。',
  },
  'portal.days.14': { tr: '14 gün', en: '14 days', ja: '14日間' },
  'portal.days.3': { tr: '3 gün', en: '3 days', ja: '3日間' },

  // -------------------------- Uygunsuzluk raporu ----------------------------
  'ncr.subject': { tr: 'Uygunsuzluk raporu — {no}', en: 'Non-conformance report — {no}', ja: '不適合報告書 — {no}' },
  'ncr.title': { tr: 'Uygunsuzluk raporu (NCR)', en: 'Non-conformance report (NCR)', ja: '不適合報告書（NCR）' },
  'ncr.body': {
    tr: 'Firmanıza ait bir ürün/süreç ile ilgili uygunsuzluk kaydı açılmıştır. Aşağıdaki bağlantı üzerinden kök neden analizi ve düzeltici faaliyet planınızı (8D) sisteme girmenizi rica ederiz.',
    en: 'A non-conformance has been raised regarding a product or process of your company. Please submit your root cause analysis and corrective action plan (8D) through the link below.',
    ja: '貴社の製品または工程に関する不適合を記録いたしました。下のリンクより、根本原因分析および是正処置計画（8D）をご提出くださいますようお願いいたします。',
  },
  'ncr.btn': { tr: 'Uygunsuzluğu cevapla', en: 'Respond to the NCR', ja: '不適合に回答する' },
} satisfies Record<string, Entry>;

export type MailTextKey = keyof typeof text;

/** Seçili dildeki e-posta metnini döner; {değişken} yer tutucularını doldurur. */
export function mt(lang: MailLang, key: MailTextKey, vars?: Record<string, string | number>): string {
  let out: string = text[key][lang];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

/** Bilinmeyen/boş değeri güvenle 'tr'ye düşürür. */
export function asMailLang(value: unknown): MailLang {
  return value === 'en' || value === 'ja' ? value : 'tr';
}
