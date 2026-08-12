import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { ut } from '../lib/uiText.js';
import { logActivity } from '../lib/activity.js';
import { ah, badRequest, notFound, parse } from '../lib/http.js';
import { sha256 } from '../lib/ids.js';
import { notifyNcrResponded } from '../lib/notifications.js';
import { createTask } from '../lib/tasks.js';
import { portalLimiter } from '../middleware/rateLimit.js';
import { persistDocument, upload } from '../middleware/upload.js';

/**
 * Tedarikçi self-servis uçları.
 *
 * Tasarım kararı: tedarikçinin hesabı ve şifresi yoktur ("tedarikçinin panele
 * ihtiyacı yok"). Bunun yerine e-postayla gönderilen, süreli ve tek varlığa
 * kapsamlanmış imzalı bağlantılar kullanılır. Faz 4'ün karşılıklı dosya
 * paylaşımı ve NCR cevapları bu mekanizma üzerinden yürür.
 */
export const portalRoutes = Router();
portalRoutes.use(portalLimiter);

type TokenRow = {
  id: number;
  purpose: string;
  entity_type: string;
  entity_id: number;
  email: string;
  expires_at: string;
  revoked: number;
};

function resolveToken(token: string): TokenRow {
  const row = db
    .prepare('SELECT * FROM portal_tokens WHERE token_hash = ?')
    .get(sha256(token)) as TokenRow | undefined;
  if (!row) throw notFound('Bağlantı geçersiz.');
  if (row.revoked) throw badRequest('Bu bağlantı iptal edilmiş.');
  if (new Date(row.expires_at.replace(' ', 'T') + 'Z') < new Date()) {
    throw badRequest('Bağlantının süresi dolmuş. Lütfen yetkilinizle iletişime geçin.');
  }
  return row;
}

/** Başvuru durumu sorgulama — referans no + e-posta ile, token gerektirmez. */
const trackSchema = z.object({
  ref_no: z.string().trim().min(4).max(40),
  email: z.string().trim().email(),
});

portalRoutes.post(
  '/track',
  ah((req, res) => {
    const body = parse(trackSchema, req.body);
    const app = db
      .prepare(
        `SELECT id, ref_no, company_name, status, created_at, updated_at, reviewed_at
           FROM applications WHERE upper(ref_no) = upper(?) AND lower(email) = lower(?)`,
      )
      .get(body.ref_no, body.email) as
      | { id: number; ref_no: string; company_name: string; status: string; created_at: string; updated_at: string }
      | undefined;

    // Bilgi sızdırmamak için "bulunamadı" tek tip mesajla döner.
    if (!app) throw notFound(ut(req, 'notfound.application'));

    const audit = db
      .prepare(
        `SELECT status, planned_date, completed_at FROM audits WHERE application_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(app.id) as { status: string; planned_date: string | null; completed_at: string | null } | undefined;

    // Tedarikçiyle paylaşılan notlar
    const messages = db
      .prepare(
        `SELECT body, created_at FROM notes
          WHERE entity_type = 'APPLICATION' AND entity_id = ? AND visibility = 'SHARED'
          ORDER BY id DESC LIMIT 20`,
      )
      .all(app.id);

    res.json({
      ref_no: app.ref_no,
      company_name: app.company_name,
      status: app.status,
      created_at: app.created_at,
      updated_at: app.updated_at,
      audit: audit ? { status: audit.status, planned_date: audit.planned_date, completed_at: audit.completed_at } : null,
      messages,
    });
  }),
);

/** Bağlantı ile açılan self-servis alanının içeriği. */
portalRoutes.get(
  '/:token',
  ah((req, res) => {
    const t = resolveToken(req.params.token);

    if (t.entity_type === 'APPLICATION') {
      const app = db
        .prepare('SELECT id, ref_no, company_name, status, created_at FROM applications WHERE id = ?')
        .get(t.entity_id) as Record<string, unknown> | undefined;
      if (!app) throw notFound('Başvuru bulunamadı.');

      const requests = db
        .prepare(
          `SELECT body, created_at FROM notes
            WHERE entity_type = 'APPLICATION' AND entity_id = ? AND visibility = 'SHARED'
            ORDER BY id DESC LIMIT 10`,
        )
        .all(t.entity_id);
      const documents = db
        .prepare(
          `SELECT id, original_name, size_bytes, created_at, uploaded_by_supplier
             FROM documents WHERE owner_type = 'APPLICATION' AND owner_id = ?
              AND (uploaded_by_supplier = 1 OR visibility = 'SHARED') ORDER BY id DESC`,
        )
        .all(t.entity_id);

      return res.json({ purpose: t.purpose, entity: 'APPLICATION', application: app, requests, documents });
    }

    if (t.entity_type === 'NCR') {
      const ncr = db
        .prepare(
          `SELECT n.id, n.ncr_no, n.title, n.category, n.severity, n.description, n.part_no, n.qty_affected,
                  n.detected_at, n.due_date, n.status, n.containment, n.root_cause, n.corrective_action,
                  n.preventive_action, n.responded_at, s.company_name
             FROM ncrs n JOIN suppliers s ON s.id = n.supplier_id WHERE n.id = ?`,
        )
        .get(t.entity_id) as Record<string, unknown> | undefined;
      if (!ncr) throw notFound('Uygunsuzluk raporu bulunamadı.');

      const documents = db
        .prepare(
          `SELECT id, original_name, size_bytes, created_at, uploaded_by_supplier
             FROM documents WHERE owner_type = 'NCR' AND owner_id = ?
              AND (uploaded_by_supplier = 1 OR visibility = 'SHARED') ORDER BY id DESC`,
        )
        .all(t.entity_id);
      return res.json({ purpose: t.purpose, entity: 'NCR', ncr, documents });
    }

    if (t.entity_type === 'SUPPLIER') {
      const supplier = db
        .prepare('SELECT id, supplier_code, company_name, grade, status FROM suppliers WHERE id = ?')
        .get(t.entity_id) as Record<string, unknown> | undefined;
      if (!supplier) throw notFound('Tedarikçi bulunamadı.');
      const documents = db
        .prepare(
          `SELECT id, original_name, size_bytes, created_at, uploaded_by_supplier
             FROM documents WHERE owner_type = 'SUPPLIER' AND owner_id = ?
              AND (uploaded_by_supplier = 1 OR visibility = 'SHARED') ORDER BY id DESC`,
        )
        .all(t.entity_id);
      return res.json({ purpose: t.purpose, entity: 'SUPPLIER', supplier, documents });
    }

    throw badRequest('Desteklenmeyen bağlantı türü.');
  }),
);

/** Tedarikçi belge yükleme. */
portalRoutes.post(
  '/:token/documents',
  upload.array('files', 10),
  ah((req, res) => {
    const t = resolveToken(req.params.token);
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw badRequest('En az bir dosya seçiniz.');

    const kind = t.entity_type === 'NCR' ? 'NCR_RESPONSE' : 'OTHER';
    const stored = files.map((file) =>
      persistDocument({
        file,
        ownerType: t.entity_type as 'APPLICATION',
        ownerId: t.entity_id,
        kind,
        visibility: 'SHARED',
        uploadedBySupplier: true,
        note: 'Tedarikçi tarafından yüklendi',
      }),
    );

    db.prepare("UPDATE portal_tokens SET used_at = datetime('now') WHERE id = ?").run(t.id);
    logActivity({
      entityType: t.entity_type as 'APPLICATION',
      entityId: t.entity_id,
      action: 'SUPPLIER_DOCUMENT_UPLOADED',
      actor: { id: null, label: t.email },
      detail: stored.map((s) => s.originalName).join(', '),
    });

    createTask({
      type: 'REVIEW_DOCUMENT',
      title: 'Tedarikçi belge yükledi — inceleme gerekiyor',
      description: stored.map((s) => s.originalName).join(', '),
      entityType: t.entity_type as 'APPLICATION',
      entityId: t.entity_id,
      assignedRole: t.entity_type === 'NCR' ? 'QUALITY' : 'MODERATOR',
      dueInDays: 7,
    });

    res.status(201).json({ ok: true, documents: stored.map((s) => ({ id: s.id, name: s.originalName })) });
  }),
);

/** Tedarikçinin başvuruya mesaj/açıklama eklemesi. */
portalRoutes.post(
  '/:token/messages',
  ah((req, res) => {
    const t = resolveToken(req.params.token);
    const body = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);

    db.prepare(
      `INSERT INTO notes (entity_type, entity_id, author_label, body, visibility)
       VALUES (?, ?, ?, ?, 'SHARED')`,
    ).run(t.entity_type, t.entity_id, t.email, body.body);

    logActivity({
      entityType: t.entity_type as 'APPLICATION',
      entityId: t.entity_id,
      action: 'SUPPLIER_MESSAGE',
      actor: { id: null, label: t.email },
      detail: body.body.slice(0, 300),
    });
    res.status(201).json({ ok: true });
  }),
);

/** Faz 4 — Tedarikçinin 8D düzeltici faaliyet cevabı. */
const ncrResponseSchema = z.object({
  containment: z.string().trim().max(4000).optional(),
  root_cause: z.string().trim().min(10, 'Kök neden analizi giriniz.').max(4000),
  corrective_action: z.string().trim().min(10, 'Düzeltici faaliyet giriniz.').max(4000),
  preventive_action: z.string().trim().max(4000).optional(),
});

portalRoutes.post(
  '/:token/ncr-response',
  ah(async (req, res) => {
    const t = resolveToken(req.params.token);
    if (t.entity_type !== 'NCR') throw badRequest('Bu bağlantı uygunsuzluk cevabı için geçerli değil.');
    const body = parse(ncrResponseSchema, req.body);

    const ncr = db.prepare('SELECT id, ncr_no, status, supplier_id FROM ncrs WHERE id = ?').get(t.entity_id) as
      | { id: number; ncr_no: string; status: string; supplier_id: number }
      | undefined;
    if (!ncr) throw notFound('Uygunsuzluk raporu bulunamadı.');
    if (['CLOSED', 'REJECTED'].includes(ncr.status)) throw badRequest('Bu uygunsuzluk kaydı kapatılmış.');

    db.prepare(
      `UPDATE ncrs SET containment = ?, root_cause = ?, corrective_action = ?, preventive_action = ?,
              status = 'SUPPLIER_RESPONDED', responded_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?`,
    ).run(body.containment ?? null, body.root_cause, body.corrective_action, body.preventive_action ?? null, t.entity_id);

    db.prepare("UPDATE portal_tokens SET used_at = datetime('now') WHERE id = ?").run(t.id);
    logActivity({
      entityType: 'NCR',
      entityId: t.entity_id,
      action: 'STATUS_CHANGED',
      actor: { id: null, label: t.email },
      from: ncr.status,
      to: 'SUPPLIER_RESPONDED',
      detail: 'Tedarikçi düzeltici faaliyet planını iletti.',
    });

    const supplier = db.prepare('SELECT company_name FROM suppliers WHERE id = ?').get(ncr.supplier_id) as {
      company_name: string;
    };
    await notifyNcrResponded({ id: ncr.id, ncr_no: ncr.ncr_no }, supplier.company_name);

    res.json({ ok: true, message: 'Cevabınız iletildi. Kalite birimimiz inceleyecektir.' });
  }),
);
