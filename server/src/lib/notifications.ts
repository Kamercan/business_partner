import { config } from '../config.js';
import { db } from '../db/index.js';
import { button, keyValueTable, layout, sendMail } from './mailer.js';
import { escapeHtml } from './text.js';

const trackUrl = (ref: string, email: string) =>
  `${config.publicBaseUrl}/basvuru-takip?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`;

const portalUrl = (token: string) => `${config.publicBaseUrl}/portal/${token}`;

/** Roldeki aktif kullanıcıların e-postaları — iç bildirimler için. */
function roleEmails(role: string): string[] {
  const rows = db.prepare('SELECT email FROM users WHERE role = ? AND is_active = 1').all(role) as Array<{
    email: string;
  }>;
  return rows.map((r) => r.email);
}

/** Faz 1 — Tedarikçiye başvuru alındı bilgisi. */
export async function notifyApplicationReceived(app: {
  id: number;
  ref_no: string;
  company_name: string;
  email: string;
  contact_name: string;
}): Promise<void> {
  await sendMail({
    to: app.email,
    subject: `Başvurunuz alındı — ${app.ref_no}`,
    template: 'APPLICATION_RECEIVED',
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      'Başvurunuz alındı',
      `<p style="font-size:14px;line-height:1.6;">Sayın ${escapeHtml(app.contact_name)},</p>
       <p style="font-size:14px;line-height:1.6;">
         <strong>${escapeHtml(app.company_name)}</strong> adına yaptığınız tedarikçi başvurusu sistemimize ulaşmıştır.
         Başvurunuz Teknik Satınalma ve Kaynak Geliştirme ekibimiz tarafından değerlendirilecek ve
         10 iş günü içinde tarafınıza dönüş yapılacaktır.
       </p>
       ${keyValueTable([
         ['Başvuru referans no', app.ref_no],
         ['Firma', app.company_name],
       ])}
       <p style="font-size:13px;line-height:1.6;color:#555;">
         Başvurunuzun güncel durumunu aşağıdaki bağlantıdan referans numaranız ve e-posta adresinizle takip edebilirsiniz.
       </p>
       ${button(trackUrl(app.ref_no, app.email), 'Başvuru durumunu görüntüle')}`,
    ),
  });

  // İç bildirim: satınalma ekibi
  const internal = [...new Set([...config.notifyEmails, ...roleEmails('MODERATOR')])];
  await sendMail({
    to: internal,
    subject: `Yeni tedarikçi başvurusu — ${app.company_name} (${app.ref_no})`,
    template: 'APPLICATION_RECEIVED_INTERNAL',
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      'Yeni tedarikçi başvurusu',
      `${keyValueTable([
        ['Referans', app.ref_no],
        ['Firma', app.company_name],
        ['Yetkili', app.contact_name],
        ['E-posta', app.email],
      ])}
      ${button(`${config.publicBaseUrl}/yonetim/basvurular/${app.id}`, 'Panelde aç')}`,
    ),
  });
}

/** Faz 2/3 — Durum değişikliği bildirimi. */
export async function notifyStatusChange(
  app: { id: number; ref_no: string; company_name: string; email: string; contact_name: string },
  status: string,
  note?: string | null,
): Promise<void> {
  const messages: Record<string, { subject: string; title: string; body: string }> = {
    AUDIT_PENDING: {
      subject: `Başvurunuz ön değerlendirmeyi geçti — ${app.ref_no}`,
      title: 'Başvurunuz ön değerlendirmeyi geçti',
      body: 'Başvurunuz Teknik Satınalma ekibimizin ön değerlendirmesini başarıyla geçmiştir. Sıradaki adım Kalite Güvence birimimizin tedarikçi denetimidir; denetim planlaması için kısa süre içinde sizinle iletişime geçilecektir.',
    },
    AUDIT_PLANNED: {
      subject: `Tedarikçi denetiminiz planlandı — ${app.ref_no}`,
      title: 'Tedarikçi denetiminiz planlandı',
      body: 'Kalite Güvence birimimiz firmanız için bir denetim planlamıştır. Denetim tarihi ve kapsamı için ekibimiz sizinle iletişime geçecektir.',
    },
    APPROVED: {
      subject: `Tebrikler — onaylı tedarikçi havuzumuza katıldınız (${app.ref_no})`,
      title: 'Onaylı tedarikçi havuzumuza katıldınız',
      body: 'Denetim süreciniz başarıyla tamamlanmıştır. Firmanız Yanmar Türkiye onaylı tedarikçi havuzuna eklenmiştir. Bundan sonra ilgili ürün gruplarındaki teklif (RFQ) süreçlerimize davet edileceksiniz.',
    },
    REJECTED: {
      subject: `Başvurunuz hakkında — ${app.ref_no}`,
      title: 'Başvurunuz hakkında',
      body: 'Başvurunuzu değerlendirdik. Mevcut tedarik ihtiyaçlarımız ve değerlendirme kriterlerimiz doğrultusunda başvurunuz bu aşamada olumlu sonuçlanmamıştır. İlginiz için teşekkür ederiz; ihtiyaçlarımız değiştiğinde başvurunuz havuzumuzda değerlendirilmeye devam edecektir.',
    },
    DISQUALIFIED: {
      subject: `Denetim sonucunuz hakkında — ${app.ref_no}`,
      title: 'Denetim sonucunuz hakkında',
      body: 'Gerçekleştirilen tedarikçi denetimi sonucunda firmanız bu aşamada onaylı tedarikçi kriterlerimizi karşılamamıştır. Denetim raporundaki iyileştirme alanlarını tamamladıktan sonra yeniden başvurabilirsiniz.',
    },
    ON_HOLD: {
      subject: `Başvurunuz beklemeye alındı — ${app.ref_no}`,
      title: 'Başvurunuz beklemeye alındı',
      body: 'Başvurunuz kayıt altına alınmış olup, ilgili ürün grubunda tedarik ihtiyacı doğduğunda yeniden değerlendirilmek üzere havuzumuzda bekletilmektedir.',
    },
  };

  const m = messages[status];
  if (!m) return;

  await sendMail({
    to: app.email,
    subject: m.subject,
    template: `STATUS_${status}`,
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      m.title,
      `<p style="font-size:14px;line-height:1.6;">Sayın ${escapeHtml(app.contact_name)},</p>
       <p style="font-size:14px;line-height:1.6;">${escapeHtml(m.body)}</p>
       ${note ? `<div style="background:#f7f7f7;border-left:3px solid #E60012;padding:12px 14px;margin:16px 0;font-size:13px;line-height:1.6;"><strong>Ek not:</strong><br>${escapeHtml(note)}</div>` : ''}
       ${keyValueTable([['Başvuru referans no', app.ref_no], ['Firma', app.company_name]])}
       ${button(trackUrl(app.ref_no, app.email), 'Başvuru durumunu görüntüle')}`,
    ),
  });
}

/** Faz 2 — Eksik bilgi talebi (tek kullanımlık güvenli bağlantı ile). */
export async function notifyInfoRequest(
  app: { id: number; ref_no: string; company_name: string; email: string; contact_name: string },
  message: string,
  token: string,
): Promise<void> {
  await sendMail({
    to: app.email,
    subject: `Başvurunuz için ek bilgi talebi — ${app.ref_no}`,
    template: 'INFO_REQUEST',
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      'Ek bilgi / belge talebi',
      `<p style="font-size:14px;line-height:1.6;">Sayın ${escapeHtml(app.contact_name)},</p>
       <p style="font-size:14px;line-height:1.6;">
         <strong>${escapeHtml(app.ref_no)}</strong> numaralı başvurunuzun değerlendirilebilmesi için
         aşağıdaki bilgi ve belgelere ihtiyacımız bulunmaktadır:
       </p>
       <div style="background:#fff5f5;border:1px solid #ffd0d4;border-radius:6px;padding:14px;margin:16px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</div>
       <p style="font-size:13px;line-height:1.6;color:#555;">
         Aşağıdaki güvenli bağlantı üzerinden belgelerinizi yükleyebilirsiniz. Bağlantı 30 gün geçerlidir ve
         yalnızca sizin başvurunuza erişim sağlar.
       </p>
       ${button(portalUrl(token), 'Belge yükle')}`,
    ),
  });
}

/** Faz 3 — Kalite birimine denetim görevi bildirimi. */
export async function notifyAuditAssigned(audit: {
  id: number;
  audit_no: string;
  company_name: string;
  auditorEmail?: string | null;
}): Promise<void> {
  const to = audit.auditorEmail ? [audit.auditorEmail] : roleEmails('QUALITY');
  await sendMail({
    to,
    subject: `Denetim görevi: ${audit.company_name} (${audit.audit_no})`,
    template: 'AUDIT_ASSIGNED',
    entityType: 'AUDIT',
    entityId: audit.id,
    html: layout(
      'Yeni denetim görevi',
      `<p style="font-size:14px;line-height:1.6;">
         Satınalma onayından geçen bir tedarikçi adayı için denetim göreviniz oluşturuldu.
       </p>
       ${keyValueTable([['Denetim no', audit.audit_no], ['Firma', audit.company_name]])}
       ${button(`${config.publicBaseUrl}/yonetim/denetimler/${audit.id}`, 'Denetimi aç')}`,
    ),
  });
}

/** Faz 4 — Tedarikçiye uygunsuzluk raporu bildirimi. */
export async function notifyNcrOpened(
  ncr: { id: number; ncr_no: string; title: string; severity: string; due_date: string | null; description: string },
  supplier: { company_name: string; email: string },
  token: string,
): Promise<void> {
  const severityTr: Record<string, string> = { MINOR: 'Küçük', MAJOR: 'Büyük', CRITICAL: 'Kritik' };
  await sendMail({
    to: supplier.email,
    subject: `Uygunsuzluk raporu — ${ncr.ncr_no}`,
    template: 'NCR_OPENED',
    entityType: 'NCR',
    entityId: ncr.id,
    html: layout(
      'Uygunsuzluk raporu (NCR)',
      `<p style="font-size:14px;line-height:1.6;">Sayın yetkili (${escapeHtml(supplier.company_name)}),</p>
       <p style="font-size:14px;line-height:1.6;">
         Firmanıza ait bir ürün/süreç ile ilgili uygunsuzluk kaydı açılmıştır.
         Aşağıdaki bağlantı üzerinden kök neden analizi ve düzeltici faaliyet planınızı (8D)
         sisteme girmenizi rica ederiz.
       </p>
       ${keyValueTable([
         ['Rapor no', ncr.ncr_no],
         ['Konu', ncr.title],
         ['Önem derecesi', severityTr[ncr.severity] ?? ncr.severity],
         ['Son cevap tarihi', ncr.due_date ?? '-'],
       ])}
       <div style="background:#f7f7f7;padding:12px 14px;margin:16px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(ncr.description)}</div>
       ${button(portalUrl(token), 'Uygunsuzluğu cevapla')}`,
    ),
  });
}

/** Faz 4 — Tedarikçi NCR cevabı girdiğinde kalite birimini uyar. */
export async function notifyNcrResponded(ncr: { id: number; ncr_no: string }, companyName: string): Promise<void> {
  await sendMail({
    to: roleEmails('QUALITY'),
    subject: `NCR cevabı alındı — ${ncr.ncr_no} (${companyName})`,
    template: 'NCR_RESPONDED',
    entityType: 'NCR',
    entityId: ncr.id,
    html: layout(
      'Uygunsuzluk cevabı alındı',
      `<p style="font-size:14px;line-height:1.6;">
         <strong>${escapeHtml(companyName)}</strong> firması <strong>${escapeHtml(ncr.ncr_no)}</strong>
         numaralı uygunsuzluk raporu için düzeltici faaliyet planını iletti. İncelemeniz bekleniyor.
       </p>
       ${button(`${config.publicBaseUrl}/yonetim/uygunsuzluklar/${ncr.id}`, 'Cevabı incele')}`,
    ),
  });
}

/** Faz 4 — Süresi yaklaşan sözleşmeler için hatırlatma. */
export async function notifyContractExpiring(contract: {
  id: number;
  contract_no: string;
  title: string;
  end_date: string;
  company_name: string;
  ownerEmail?: string | null;
}): Promise<void> {
  const to = contract.ownerEmail ? [contract.ownerEmail] : roleEmails('MODERATOR');
  await sendMail({
    to,
    subject: `Sözleşme yenileme hatırlatması — ${contract.contract_no}`,
    template: 'CONTRACT_EXPIRING',
    entityType: 'CONTRACT',
    entityId: contract.id,
    html: layout(
      'Sözleşme yenileme hatırlatması',
      `${keyValueTable([
        ['Sözleşme no', contract.contract_no],
        ['Başlık', contract.title],
        ['Tedarikçi', contract.company_name],
        ['Bitiş tarihi', contract.end_date],
      ])}
      ${button(`${config.publicBaseUrl}/yonetim/sozlesmeler/${contract.id}`, 'Sözleşmeyi aç')}`,
    ),
  });
}
