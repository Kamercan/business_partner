import { config } from '../config.js';
import { db } from '../db/index.js';
import { button, keyValueTable, layout, sendMail } from './mailer.js';
import { asMailLang, mt, type MailLang } from './mailText.js';
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
  lang?: string | null;
}): Promise<void> {
  const lang = asMailLang(app.lang);
  await sendMail({
    to: app.email,
    subject: mt(lang, 'received.subject', { ref: app.ref_no }),
    template: 'APPLICATION_RECEIVED',
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      mt(lang, 'received.title'),
      `<p style="font-size:14px;line-height:1.6;">${mt(lang, 'greeting.person', { name: escapeHtml(app.contact_name) })}</p>
       <p style="font-size:14px;line-height:1.6;">
         ${mt(lang, 'received.body', { company: escapeHtml(app.company_name) })}
       </p>
       ${keyValueTable([
         [mt(lang, 'kv.ref'), app.ref_no],
         [mt(lang, 'kv.company'), app.company_name],
       ])}
       <p style="font-size:13px;line-height:1.6;color:#555;">
         ${mt(lang, 'received.track')}
       </p>
       ${button(trackUrl(app.ref_no, app.email), mt(lang, 'btn.track'))}`,
      undefined,
      lang,
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
  app: { id: number; ref_no: string; company_name: string; email: string; contact_name: string; lang?: string | null },
  status: string,
  note?: string | null,
): Promise<void> {
  /** Tedarikçiye bildirilen durumlar — diğerleri sessiz geçilir. */
  const NOTIFIED = ['AUDIT_PENDING', 'AUDIT_PLANNED', 'APPROVED', 'REJECTED', 'DISQUALIFIED', 'ON_HOLD'] as const;
  if (!(NOTIFIED as readonly string[]).includes(status)) return;

  const lang = asMailLang(app.lang);
  const key = status as (typeof NOTIFIED)[number];

  await sendMail({
    to: app.email,
    subject: mt(lang, `status.${key}.subject`, { ref: app.ref_no }),
    template: `STATUS_${status}`,
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      mt(lang, `status.${key}.title`),
      `<p style="font-size:14px;line-height:1.6;">${mt(lang, 'greeting.person', { name: escapeHtml(app.contact_name) })}</p>
       <p style="font-size:14px;line-height:1.6;">${mt(lang, `status.${key}.body`)}</p>
       ${note ? `<div style="background:#f7f7f7;border-left:3px solid #E60012;padding:12px 14px;margin:16px 0;font-size:13px;line-height:1.6;"><strong>${mt(lang, 'note.extra')}</strong><br>${escapeHtml(note)}</div>` : ''}
       ${keyValueTable([[mt(lang, 'kv.ref'), app.ref_no], [mt(lang, 'kv.company'), app.company_name]])}
       ${button(trackUrl(app.ref_no, app.email), mt(lang, 'btn.track'))}`,
      undefined,
      lang,
    ),
  });
}

/** Faz 2 — Eksik bilgi talebi (tek kullanımlık güvenli bağlantı ile). */
export async function notifyInfoRequest(
  app: { id: number; ref_no: string; company_name: string; email: string; contact_name: string; lang?: string | null },
  message: string,
  token: string,
): Promise<void> {
  const lang = asMailLang(app.lang);
  await sendMail({
    to: app.email,
    subject: mt(lang, 'info.subject', { ref: app.ref_no }),
    template: 'INFO_REQUEST',
    entityType: 'APPLICATION',
    entityId: app.id,
    html: layout(
      mt(lang, 'info.title'),
      `<p style="font-size:14px;line-height:1.6;">${mt(lang, 'greeting.person', { name: escapeHtml(app.contact_name) })}</p>
       <p style="font-size:14px;line-height:1.6;">
         ${mt(lang, 'info.body', { ref: escapeHtml(app.ref_no) })}
       </p>
       <div style="background:#fff5f5;border:1px solid #ffd0d4;border-radius:6px;padding:14px;margin:16px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</div>
       <p style="font-size:13px;line-height:1.6;color:#555;">
         ${mt(lang, 'info.link')}
       </p>
       ${button(portalUrl(token), mt(lang, 'info.btn'))}`,
      undefined,
      lang,
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

/**
 * Onay sonrası tedarikçi portalı daveti — tedarikçi parolasını kendisi belirler.
 * `isReset` true ise parola sıfırlama metni kullanılır.
 */
export async function notifyPortalInvite(
  supplier: { id: number; company_name: string; email: string; lang?: string | null },
  token: string,
  isReset = false,
): Promise<void> {
  const lang = asMailLang(supplier.lang);
  const url = `${config.publicBaseUrl}/tedarikci/parola/${token}`;
  await sendMail({
    to: supplier.email,
    subject: mt(lang, isReset ? 'portal.reset.subject' : 'portal.invite.subject'),
    template: isReset ? 'PORTAL_RESET' : 'PORTAL_INVITE',
    entityType: 'SUPPLIER',
    entityId: supplier.id,
    html: layout(
      mt(lang, isReset ? 'portal.reset.title' : 'portal.invite.title'),
      `<p style="font-size:14px;line-height:1.6;">${mt(lang, 'greeting.company', { company: escapeHtml(supplier.company_name) })}</p>
       <p style="font-size:14px;line-height:1.6;">
         ${mt(lang, isReset ? 'portal.reset.body' : 'portal.invite.body')}
       </p>
       ${keyValueTable([[mt(lang, 'kv.login.email'), supplier.email]])}
       <p style="font-size:13px;line-height:1.6;color:#555;">
         ${mt(lang, 'portal.what')}
       </p>
       ${button(url, mt(lang, isReset ? 'portal.reset.btn' : 'portal.invite.btn'))}
       <p style="font-size:12px;color:#888;line-height:1.6;">
         ${mt(lang, 'portal.validity', {
           days: mt(lang, isReset ? 'portal.days.3' : 'portal.days.14'),
           url: `${config.publicBaseUrl}/business-partner?giris=tedarikci`,
         })}
       </p>`,
      undefined,
      lang,
    ),
  });
}

/** Faz 4 — Tedarikçiye uygunsuzluk raporu bildirimi. */
export async function notifyNcrOpened(
  ncr: { id: number; ncr_no: string; title: string; severity: string; due_date: string | null; description: string },
  supplier: { company_name: string; email: string; lang?: string | null },
  token: string,
): Promise<void> {
  const lang = asMailLang(supplier.lang);
  const severity = severityLabel(lang, ncr.severity);
  await sendMail({
    to: supplier.email,
    subject: mt(lang, 'ncr.subject', { no: ncr.ncr_no }),
    template: 'NCR_OPENED',
    entityType: 'NCR',
    entityId: ncr.id,
    html: layout(
      mt(lang, 'ncr.title'),
      `<p style="font-size:14px;line-height:1.6;">${mt(lang, 'greeting.company', { company: escapeHtml(supplier.company_name) })}</p>
       <p style="font-size:14px;line-height:1.6;">
         ${mt(lang, 'ncr.body')}
       </p>
       ${keyValueTable([
         [mt(lang, 'kv.ncr.no'), ncr.ncr_no],
         [mt(lang, 'kv.ncr.subject'), ncr.title],
         [mt(lang, 'kv.ncr.severity'), severity],
         [mt(lang, 'kv.ncr.due'), ncr.due_date ?? '-'],
       ])}
       <div style="background:#f7f7f7;padding:12px 14px;margin:16px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(ncr.description)}</div>
       ${button(portalUrl(token), mt(lang, 'ncr.btn'))}`,
      undefined,
      lang,
    ),
  });
}

/** Uygunsuzluk önem derecesinin seçili dildeki karşılığı. */
function severityLabel(lang: MailLang, severity: string): string {
  if (severity === 'MINOR' || severity === 'MAJOR' || severity === 'CRITICAL') {
    return mt(lang, `severity.${severity}`);
  }
  return severity;
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
