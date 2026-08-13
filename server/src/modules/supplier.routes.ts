import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { COUNTRIES } from '../lib/constants.js';
import { logActivity } from '../lib/activity.js';
import { ah, badRequest, notFound, parse, unauthorized } from '../lib/http.js';
import { randomToken, sha256 } from '../lib/ids.js';
import { notifyNcrResponded, notifyPortalInvite } from '../lib/notifications.js';
import { createTask } from '../lib/tasks.js';
import { loginLimiter, portalLimiter } from '../middleware/rateLimit.js';
import { PORTAL_ALLOWED_STATUSES, requireSupplier, signSupplierToken } from '../middleware/supplierAuth.js';
import { documentPath, persistDocument, upload } from '../middleware/upload.js';
import { ut } from '../lib/uiText.js';

/**
 * Onaylı tedarikçi portalı.
 *
 * Tedarikçi parolasını, onay e-postasıyla gelen tek kullanımlık bağlantıdan
 * kendisi belirler. Bundan sonra e-posta + parola ile istediği zaman girip
 * belge yükleyebilir, uygunsuzluklara cevap verebilir ve sözleşmelerini görür.
 * Yalnızca APPROVED / CONDITIONAL durumundaki tedarikçiler girebilir.
 */
export const supplierRoutes = Router();

/**
 * Ülke kodunun üç dildeki adı. Kod listede yoksa (başvuruda "diğer" seçilip
 * ülke adı elle yazılmışsa) yazılan metin üç dilde de olduğu gibi gösterilir.
 */
function countryLabel(code: string): { name_tr: string; name_en: string; name_ja: string } {
  const found = COUNTRIES.find((c) => c.code === code.toLowerCase());
  return found ? { name_tr: found.tr, name_en: found.en, name_ja: found.ja } : { name_tr: code, name_en: code, name_ja: code };
}

const passwordRule = z
  .string()
  .min(8, 'Parola en az 8 karakter olmalıdır.')
  .max(200)
  .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, 'Parola en az bir harf içermelidir.')
  .regex(/[0-9]/, 'Parola en az bir rakam içermelidir.');

// ---------------------------------------------------------------------------
// Parola belirleme (davet bağlantısı ile)
// ---------------------------------------------------------------------------

type TokenRow = {
  id: number;
  purpose: string;
  entity_type: string;
  entity_id: number;
  email: string;
  expires_at: string;
  revoked: number;
  used_at: string | null;
};

function resolveSetPasswordToken(req: Request, token: string): TokenRow {
  const row = db.prepare('SELECT * FROM portal_tokens WHERE token_hash = ?').get(sha256(token)) as TokenRow | undefined;
  if (!row || row.purpose !== 'SET_PASSWORD' || row.entity_type !== 'SUPPLIER') {
    throw badRequest(ut(req, 'token.invalid'));
  }
  if (row.revoked) throw badRequest(ut(req, 'token.revoked'));
  if (row.used_at) throw badRequest(ut(req, 'token.used'));
  if (new Date(row.expires_at.replace(' ', 'T') + 'Z') < new Date()) {
    throw badRequest(ut(req, 'token.expired'));
  }
  return row;
}

/** Bağlantının geçerliliğini ve hangi firmaya ait olduğunu döner. */
supplierRoutes.get(
  '/set-password/:token',
  portalLimiter,
  ah((req, res) => {
    const t = resolveSetPasswordToken(req, req.params.token);
    const supplier = db
      .prepare('SELECT company_name, supplier_code, email, password_hash FROM suppliers WHERE id = ?')
      .get(t.entity_id) as { company_name: string; supplier_code: string; email: string; password_hash: string | null } | undefined;
    if (!supplier) throw notFound(ut(req, 'notfound.supplier'));

    res.json({
      company_name: supplier.company_name,
      supplier_code: supplier.supplier_code,
      email: supplier.email,
      /** true ise parola yenileme, false ise ilk kez oluşturma ekranı gösterilir. */
      isReset: !!supplier.password_hash,
    });
  }),
);

supplierRoutes.post(
  '/set-password/:token',
  portalLimiter,
  ah((req, res) => {
    const t = resolveSetPasswordToken(req, req.params.token);
    const body = parse(z.object({ password: passwordRule }), req.body);

    const supplier = db.prepare('SELECT id, company_name, status FROM suppliers WHERE id = ?').get(t.entity_id) as
      | { id: number; company_name: string; status: string }
      | undefined;
    if (!supplier) throw notFound(ut(req, 'notfound.supplier'));
    if (!PORTAL_ALLOWED_STATUSES.includes(supplier.status as 'APPROVED')) {
      throw badRequest(ut(req, 'notfound.portal'));
    }

    db.prepare("UPDATE suppliers SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      bcrypt.hashSync(body.password, 10),
      supplier.id,
    );
    // Bağlantı tek kullanımlıktır; aynı bağlantıyla ikinci kez parola değiştirilemez.
    db.prepare("UPDATE portal_tokens SET used_at = datetime('now') WHERE id = ?").run(t.id);

    logActivity({
      entityType: 'SUPPLIER',
      entityId: supplier.id,
      action: 'PORTAL_PASSWORD_SET',
      actor: { id: null, label: t.email },
      detail: 'Tedarikçi portal parolasını belirledi.',
    });

    res.json({ ok: true, message: ut(req, 'pw.set.ok') });
  }),
);

// ---------------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------------

supplierRoutes.post(
  '/login',
  loginLimiter,
  ah((req, res) => {
    const body = parse(
      z.object({ email: z.string().trim().email('Geçerli bir e-posta giriniz.'), password: z.string().min(1, 'Parola zorunludur.') }),
      req.body,
    );

    const supplier = db
      .prepare('SELECT id, supplier_code, company_name, email, status, grade, password_hash FROM suppliers WHERE lower(email) = lower(?)')
      .get(body.email) as
      | { id: number; supplier_code: string; company_name: string; email: string; status: string; grade: string | null; password_hash: string | null }
      | undefined;

    // Kullanıcı yoksa da aynı süre harcanır (zamanlama saldırısına karşı).
    const hash = supplier?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const ok = bcrypt.compareSync(body.password, hash);

    if (!supplier || !supplier.password_hash || !ok) throw unauthorized(ut(req, 'login.bad'));
    if (!PORTAL_ALLOWED_STATUSES.includes(supplier.status as 'APPROVED')) {
      throw unauthorized(ut(req, 'login.closed'));
    }

    db.prepare("UPDATE suppliers SET portal_last_login_at = datetime('now') WHERE id = ?").run(supplier.id);
    logActivity({
      entityType: 'SUPPLIER',
      entityId: supplier.id,
      action: 'PORTAL_LOGIN',
      actor: { id: null, label: supplier.email },
    });

    const token = signSupplierToken(supplier);
    res.cookie('bp_supplier_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({
      token,
      supplier: {
        id: supplier.id,
        supplier_code: supplier.supplier_code,
        company_name: supplier.company_name,
        email: supplier.email,
        status: supplier.status,
        grade: supplier.grade,
      },
    });
  }),
);

supplierRoutes.post('/logout', (_req, res) => {
  res.clearCookie('bp_supplier_token');
  res.json({ ok: true });
});

/** Parola sıfırlama bağlantısı ister. Hesabın varlığı sızdırılmaz. */
supplierRoutes.post(
  '/forgot-password',
  loginLimiter,
  ah(async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().email() }), req.body);
    const supplier = db
      .prepare('SELECT id, company_name, email, status, lang FROM suppliers WHERE lower(email) = lower(?)')
      .get(body.email) as { id: number; company_name: string; email: string; status: string; lang: string } | undefined;

    if (supplier && PORTAL_ALLOWED_STATUSES.includes(supplier.status as 'APPROVED')) {
      const token = randomToken();
      db.prepare(
        `INSERT INTO portal_tokens (token_hash, purpose, entity_type, entity_id, email, expires_at)
         VALUES (?, 'SET_PASSWORD', 'SUPPLIER', ?, ?, datetime('now','+3 days'))`,
      ).run(sha256(token), supplier.id, supplier.email);
      await notifyPortalInvite(supplier, token, true);
    }

    res.json({ ok: true, message: ut(req, 'pw.forgot.sent') });
  }),
);

// ---------------------------------------------------------------------------
// Portal içeriği (giriş gerektirir)
// ---------------------------------------------------------------------------

supplierRoutes.use('/me', requireSupplier);
supplierRoutes.use('/documents', requireSupplier);
supplierRoutes.use('/ncrs', requireSupplier);
supplierRoutes.use('/contracts', requireSupplier);
supplierRoutes.use('/mails', requireSupplier);
supplierRoutes.use('/submissions', requireSupplier);
supplierRoutes.use('/change-password', requireSupplier);

supplierRoutes.get(
  '/me',
  ah((req, res) => {
    const s = req.supplier!;
    const detail = db
      .prepare(
        `SELECT supplier_code, company_name, tax_id, country, city, website, contact_name, email, phone,
                grade, status, approved_at, next_audit_due, otd_percent, ppm, portal_last_login_at,
                COALESCE((SELECT group_concat(sc.category_code) FROM supplier_categories sc WHERE sc.supplier_id = suppliers.id), '') AS categories
           FROM suppliers WHERE id = ?`,
      )
      .get(s.id) as Record<string, unknown>;

    const openNcrs = (
      db
        .prepare("SELECT COUNT(*) c FROM ncrs WHERE supplier_id = ? AND status NOT IN ('CLOSED','REJECTED')")
        .get(s.id) as { c: number }
    ).c;
    const pendingResponse = (
      db.prepare("SELECT COUNT(*) c FROM ncrs WHERE supplier_id = ? AND status = 'OPEN'").get(s.id) as { c: number }
    ).c;
    const activeContracts = (
      db.prepare("SELECT COUNT(*) c FROM contracts WHERE supplier_id = ? AND status = 'ACTIVE'").get(s.id) as { c: number }
    ).c;

    // Yanmar'ın tedarikçiyle paylaştığı mesaj / bilgi talepleri
    const messages = db
      .prepare(
        `SELECT n.body, n.created_at FROM notes n
          WHERE n.entity_type = 'SUPPLIER' AND n.entity_id = ? AND n.visibility = 'SHARED'
          ORDER BY n.id DESC LIMIT 20`,
      )
      .all(s.id);

    res.json({
      supplier: { ...detail, country_label: countryLabel(String(detail.country ?? '')) },
      summary: { openNcrs, pendingResponse, activeContracts },
      messages,
    });
  }),
);

supplierRoutes.post(
  '/change-password',
  ah((req, res) => {
    const body = parse(
      z.object({ current_password: z.string().min(1), new_password: passwordRule }),
      req.body,
    );
    const row = db.prepare('SELECT password_hash FROM suppliers WHERE id = ?').get(req.supplier!.id) as {
      password_hash: string;
    };
    if (!bcrypt.compareSync(body.current_password, row.password_hash)) throw badRequest(ut(req, 'pw.current.bad'));

    db.prepare("UPDATE suppliers SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      bcrypt.hashSync(body.new_password, 10),
      req.supplier!.id,
    );
    logActivity({
      entityType: 'SUPPLIER',
      entityId: req.supplier!.id,
      action: 'PORTAL_PASSWORD_CHANGED',
      actor: { id: null, label: req.supplier!.email },
    });
    res.json({ ok: true });
  }),
);

/** Tedarikçiyle paylaşılan ve tedarikçinin yüklediği belgeler. */
supplierRoutes.get(
  '/documents',
  ah((req, res) => {
    const s = req.supplier!;
    const rows = db
      .prepare(
        `SELECT d.id, d.owner_type, d.owner_id, d.kind, d.original_name, d.size_bytes, d.created_at,
                d.uploaded_by_supplier,
                CASE d.owner_type
                  WHEN 'NCR' THEN (SELECT ncr_no FROM ncrs WHERE id = d.owner_id)
                  WHEN 'CONTRACT' THEN (SELECT contract_no FROM contracts WHERE id = d.owner_id)
                  ELSE NULL
                END AS related_no
           FROM documents d
          WHERE (d.uploaded_by_supplier = 1 OR d.visibility = 'SHARED')
            AND (
              (d.owner_type = 'SUPPLIER' AND d.owner_id = ?)
              OR (d.owner_type = 'NCR' AND d.owner_id IN (SELECT id FROM ncrs WHERE supplier_id = ?))
              OR (d.owner_type = 'CONTRACT' AND d.owner_id IN (SELECT id FROM contracts WHERE supplier_id = ?))
            )
          ORDER BY d.id DESC`,
      )
      .all(s.id, s.id, s.id);
    res.json(rows);
  }),
);

supplierRoutes.post(
  '/documents',
  upload.array('files', 10),
  ah((req, res) => {
    const s = req.supplier!;
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw badRequest(ut(req, 'upload.empty'));
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 300) : null;

    const stored = files.map((file) =>
      persistDocument({
        file,
        ownerType: 'SUPPLIER',
        ownerId: s.id,
        kind: 'OTHER',
        visibility: 'SHARED',
        uploadedBySupplier: true,
        note: note ?? 'Tedarikçi portalından yüklendi',
      }),
    );

    logActivity({
      entityType: 'SUPPLIER',
      entityId: s.id,
      action: 'SUPPLIER_DOCUMENT_UPLOADED',
      actor: { id: null, label: s.email },
      detail: stored.map((f) => f.originalName).join(', '),
    });
    createTask({
      type: 'REVIEW_DOCUMENT',
      title: `Tedarikçi belge yükledi: ${s.company_name}`,
      description: stored.map((f) => f.originalName).join(', '),
      subject: s.company_name,
      entityType: 'SUPPLIER',
      entityId: s.id,
      assignedRole: 'MODERATOR',
      dueInDays: 7,
    });

    res.status(201).json({ ok: true, documents: stored.map((f) => ({ id: f.id, name: f.originalName })) });
  }),
);

/** Belge indirme — yalnızca tedarikçinin kendi kayıtlarına bağlı belgeler. */
supplierRoutes.get(
  '/documents/:id/download',
  ah((req, res) => {
    const s = req.supplier!;
    const doc = db
      .prepare(
        `SELECT d.* FROM documents d
          WHERE d.id = ?
            AND (d.uploaded_by_supplier = 1 OR d.visibility = 'SHARED')
            AND (
              (d.owner_type = 'SUPPLIER' AND d.owner_id = ?)
              OR (d.owner_type = 'NCR' AND d.owner_id IN (SELECT id FROM ncrs WHERE supplier_id = ?))
              OR (d.owner_type = 'CONTRACT' AND d.owner_id IN (SELECT id FROM contracts WHERE supplier_id = ?))
            )`,
      )
      .get(Number(req.params.id), s.id, s.id, s.id) as
      | { owner_type: string; owner_id: number; stored_name: string; original_name: string; mime_type: string }
      | undefined;
    if (!doc) throw notFound(ut(req, 'notfound.document'));

    const filePath = documentPath(doc.owner_type, doc.owner_id, doc.stored_name);
    if (!fs.existsSync(filePath)) throw notFound(ut(req, 'notfound.file'));

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  }),
);

/** Firmaya açılan uygunsuzluk raporları. */
supplierRoutes.get(
  '/ncrs',
  ah((req, res) => {
    const rows = db
      .prepare(
        `SELECT id, ncr_no, title, category, severity, description, part_no, qty_affected, detected_at,
                due_date, status, containment, root_cause, corrective_action, preventive_action, responded_at, closed_at,
                CASE WHEN status NOT IN ('CLOSED','REJECTED') AND due_date IS NOT NULL AND date(due_date) < date('now')
                     THEN 1 ELSE 0 END AS is_overdue
           FROM ncrs WHERE supplier_id = ? ORDER BY
             CASE status WHEN 'OPEN' THEN 0 WHEN 'REJECTED' THEN 1 WHEN 'SUPPLIER_RESPONDED' THEN 2 ELSE 3 END, id DESC`,
      )
      .all(req.supplier!.id);
    res.json(rows);
  }),
);

const ncrResponseSchema = z.object({
  containment: z.string().trim().max(4000).optional(),
  root_cause: z.string().trim().min(10, 'Kök neden analizi giriniz.').max(4000),
  corrective_action: z.string().trim().min(10, 'Düzeltici faaliyet giriniz.').max(4000),
  preventive_action: z.string().trim().max(4000).optional(),
});

supplierRoutes.post(
  '/ncrs/:id/respond',
  ah(async (req, res) => {
    const s = req.supplier!;
    const body = parse(ncrResponseSchema, req.body);
    const ncr = db.prepare('SELECT id, ncr_no, status FROM ncrs WHERE id = ? AND supplier_id = ?').get(
      Number(req.params.id),
      s.id,
    ) as { id: number; ncr_no: string; status: string } | undefined;
    if (!ncr) throw notFound(ut(req, 'notfound.ncr'));
    if (['CLOSED'].includes(ncr.status)) throw badRequest(ut(req, 'ncr.closed'));

    db.prepare(
      `UPDATE ncrs SET containment = ?, root_cause = ?, corrective_action = ?, preventive_action = ?,
              status = 'SUPPLIER_RESPONDED', responded_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?`,
    ).run(body.containment ?? null, body.root_cause, body.corrective_action, body.preventive_action ?? null, ncr.id);

    logActivity({
      entityType: 'NCR',
      entityId: ncr.id,
      action: 'STATUS_CHANGED',
      actor: { id: null, label: s.email },
      from: ncr.status,
      to: 'SUPPLIER_RESPONDED',
      detail: 'Tedarikçi portalından düzeltici faaliyet planı iletildi.',
    });
    await notifyNcrResponded({ id: ncr.id, ncr_no: ncr.ncr_no }, s.company_name);

    res.json({ ok: true, message: ut(req, 'ncr.responded') });
  }),
);

/** Uygunsuzluk kaydına belge ekleme (ölçüm raporu, 8D formu, fotoğraf). */
supplierRoutes.post(
  '/ncrs/:id/documents',
  upload.array('files', 10),
  ah((req, res) => {
    const s = req.supplier!;
    const ncr = db.prepare('SELECT id, ncr_no FROM ncrs WHERE id = ? AND supplier_id = ?').get(
      Number(req.params.id),
      s.id,
    ) as { id: number; ncr_no: string } | undefined;
    if (!ncr) throw notFound(ut(req, 'notfound.ncr'));

    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw badRequest(ut(req, 'upload.empty'));

    const stored = files.map((file) =>
      persistDocument({
        file,
        ownerType: 'NCR',
        ownerId: ncr.id,
        kind: 'NCR_RESPONSE',
        visibility: 'SHARED',
        uploadedBySupplier: true,
        note: 'Tedarikçi portalından yüklendi',
      }),
    );
    logActivity({
      entityType: 'NCR',
      entityId: ncr.id,
      action: 'SUPPLIER_DOCUMENT_UPLOADED',
      actor: { id: null, label: s.email },
      detail: stored.map((f) => f.originalName).join(', '),
    });
    res.status(201).json({ ok: true });
  }),
);

/**
 * Firmaya gönderilen bildirimler — tedarikçi kendi yazışma geçmişini görür.
 * Yanmar'ın iç bildirimleri buraya asla düşmez (audience = SUPPLIER filtresi)
 * ve yalnızca kendi e-posta adresine gidenler listelenir.
 */
supplierRoutes.get(
  '/mails',
  ah((req, res) => {
    const rows = db
      .prepare(
        `SELECT id, subject, template, status, created_at, sent_at
           FROM mail_outbox
          WHERE audience = 'SUPPLIER' AND lower(to_email) = lower(?)
          ORDER BY id DESC LIMIT 100`,
      )
      .all(req.supplier!.email);
    res.json(rows);
  }),
);

supplierRoutes.get(
  '/mails/:id',
  ah((req, res) => {
    const row = db
      .prepare(
        `SELECT id, subject, body_html, template, status, created_at, sent_at
           FROM mail_outbox
          WHERE id = ? AND audience = 'SUPPLIER' AND lower(to_email) = lower(?)`,
      )
      .get(Number(req.params.id), req.supplier!.email);
    if (!row) throw notFound(ut(req, 'notfound.mail'));
    res.json(row);
  }),
);

/**
 * Tedarikçinin Yanmar'a gönderdikleri — portalda "Gönderilen" kutusu.
 * Uygunsuzluk cevapları ve belge yüklemeleri, tedarikçinin kendi hareket
 * kayıtlarından türetilir; başka bir firmanın kaydı asla listelenmez.
 */
supplierRoutes.get(
  '/submissions',
  ah((req, res) => {
    const s = req.supplier!;
    const rows = db
      .prepare(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.created_at,
                (SELECT n.ncr_no FROM ncrs n WHERE n.id = a.entity_id) AS ncr_no
           FROM activity_log a
          WHERE lower(a.actor_label) = lower(?)
            AND a.action IN ('SUPPLIER_DOCUMENT_UPLOADED','STATUS_CHANGED')
            AND (a.action <> 'STATUS_CHANGED' OR a.to_value = 'SUPPLIER_RESPONDED')
            AND (
              (a.entity_type = 'SUPPLIER' AND a.entity_id = ?)
              OR (a.entity_type = 'NCR' AND a.entity_id IN (SELECT id FROM ncrs WHERE supplier_id = ?))
            )
          ORDER BY a.id DESC LIMIT 100`,
      )
      .all(s.email, s.id, s.id) as Array<Record<string, unknown>>;

    // ncr_no yalnızca uygunsuzluk kayıtları için anlamlıdır.
    res.json(rows.map((r) => ({ ...r, ncr_no: r.entity_type === 'NCR' ? r.ncr_no : null })));
  }),
);

/** Firmayla yapılan sözleşmeler. */
supplierRoutes.get(
  '/contracts',
  ah((req, res) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.contract_no, c.title, c.type, c.status, c.start_date, c.end_date, c.currency, c.value,
                (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'CONTRACT' AND d.owner_id = c.id AND d.visibility = 'SHARED') AS document_count
           FROM contracts c WHERE c.supplier_id = ? ORDER BY c.end_date IS NULL, c.end_date DESC`,
      )
      .all(req.supplier!.id);
    res.json(rows);
  }),
);
