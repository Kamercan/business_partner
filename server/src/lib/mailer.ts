import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { escapeHtml } from './text.js';

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!config.smtp.host) return null;
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

/**
 * Her bildirim önce `mail_outbox` tablosuna yazılır; SMTP yapılandırılmışsa
 * ayrıca gönderilir. Böylece demo/geliştirme ortamında da tüm bildirimler
 * yönetim panelinden izlenebilir ve hiçbir bildirim kaybolmaz.
 */
export async function sendMail(params: {
  to: string | string[];
  subject: string;
  html: string;
  template?: string;
  entityType?: string;
  entityId?: number;
}): Promise<void> {
  const recipients = (Array.isArray(params.to) ? params.to : [params.to]).filter(Boolean);
  if (recipients.length === 0) return;

  const insert = db.prepare(
    `INSERT INTO mail_outbox (to_email, subject, body_html, template, entity_type, entity_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const markSent = db.prepare("UPDATE mail_outbox SET status = 'SENT', sent_at = datetime('now') WHERE id = ?");
  const markFailed = db.prepare("UPDATE mail_outbox SET status = 'FAILED', error = ? WHERE id = ?");

  const tp = getTransporter();
  for (const to of recipients) {
    const res = insert.run(
      to,
      params.subject,
      params.html,
      params.template ?? null,
      params.entityType ?? null,
      params.entityId ?? null,
      tp ? 'QUEUED' : 'LOGGED',
    );
    if (!tp) continue;

    try {
      await tp.sendMail({ from: config.mailFrom, to, subject: params.subject, html: params.html });
      markSent.run(res.lastInsertRowid as number);
    } catch (err) {
      markFailed.run(err instanceof Error ? err.message : String(err), res.lastInsertRowid as number);
      console.error('[mail] gönderilemedi:', err);
    }
  }
}

const BRAND = '#E60012';

/** Ortak e-posta gövdesi. */
export function layout(title: string, bodyHtml: string, footer?: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:${BRAND};padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;letter-spacing:.5px;">YANMAR TÜRKİYE</td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:19px;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#888;">
          ${footer ?? 'Bu e-posta Yanmar Türkiye Business Partner Portalı tarafından otomatik olarak gönderilmiştir.'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function button(href: string, label: string): string {
  return `<p style="margin:22px 0;"><a href="${href}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:5px;font-size:14px;font-weight:bold;display:inline-block;">${escapeHtml(label)}</a></p>`;
}

export function keyValueTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;margin:8px 0 4px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:7px 0;color:#666;width:190px;border-bottom:1px solid #f0f0f0;">${escapeHtml(k)}</td>
               <td style="padding:7px 0;font-weight:bold;border-bottom:1px solid #f0f0f0;">${escapeHtml(v)}</td></tr>`,
      )
      .join('')}
  </table>`;
}
