import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { getActivity, logActivity } from '../lib/activity.js';
import { buildSimpleWorkbook } from '../lib/excel.js';
import { ah, badRequest, notFound, parse } from '../lib/http.js';
import { randomToken, sha256 } from '../lib/ids.js';
import { notifyPortalInvite } from '../lib/notifications.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const supplierRoutes = Router();
supplierRoutes.use(requireAuth);

/**
 * Parola özeti hiçbir koşulda API yanıtına çıkmamalıdır. `SELECT s.*`
 * kullanıldığı için alan burada tek noktadan ayıklanır; yerine
 * `portal_enabled` bayrağı gönderilir.
 */
function stripSecret<T extends Record<string, unknown>>(row: T): T {
  const { password_hash: _omit, ...rest } = row;
  return rest as T;
}

const SELECT = `
  SELECT s.*, a.ref_no,
         (s.password_hash IS NOT NULL) AS portal_enabled,
         COALESCE((SELECT group_concat(sc.category_code) FROM supplier_categories sc WHERE sc.supplier_id = s.id), '') AS categories,
         (SELECT COUNT(*) FROM ncrs n WHERE n.supplier_id = s.id AND n.status NOT IN ('CLOSED','REJECTED')) AS open_ncrs,
         (SELECT COUNT(*) FROM contracts c WHERE c.supplier_id = s.id AND c.status = 'ACTIVE') AS active_contracts,
         (SELECT MAX(ad.completed_at) FROM audits ad WHERE ad.supplier_id = s.id AND ad.status = 'COMPLETED') AS last_audit_at
    FROM suppliers s
    LEFT JOIN applications a ON a.id = s.application_id`;

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().optional(),
  grade: z.string().optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

function buildWhere(q: z.infer<typeof listSchema>) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const like = `%${q.q.toLowerCase()}%`;
    clauses.push('(lower(s.company_name) LIKE ? OR lower(s.supplier_code) LIKE ? OR lower(s.email) LIKE ? OR s.tax_id LIKE ?)');
    params.push(like, like, like, `%${q.q}%`);
  }
  const csvIn = (col: string, value?: string) => {
    const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    clauses.push(`${col} IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  };
  csvIn('s.status', q.status);
  csvIn('s.grade', q.grade);
  csvIn('s.country', q.country);

  const cats = (q.category ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (cats.length) {
    clauses.push(
      `EXISTS (SELECT 1 FROM supplier_categories sc WHERE sc.supplier_id = s.id AND sc.category_code IN (${cats
        .map(() => '?')
        .join(',')}))`,
    );
    params.push(...cats);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

supplierRoutes.get(
  '/',
  ah((req, res) => {
    const q = parse(listSchema, req.query);
    const { where, params } = buildWhere(q);
    const total = (db.prepare(`SELECT COUNT(*) c FROM suppliers s ${where}`).get(...params) as { c: number }).c;
    const rows = (
      db
        .prepare(`${SELECT} ${where} ORDER BY s.company_name COLLATE NOCASE LIMIT ? OFFSET ?`)
        .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Array<Record<string, unknown>>
    ).map(stripSecret);
    res.json({ rows, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) });
  }),
);

supplierRoutes.get(
  '/export',
  ah(async (req, res) => {
    const q = parse(listSchema, req.query);
    const { where, params } = buildWhere(q);
    const rows = (
      db.prepare(`${SELECT} ${where} ORDER BY s.company_name COLLATE NOCASE LIMIT 10000`).all(...params) as Array<
        Record<string, unknown>
      >
    ).map(stripSecret);
    const catNames = Object.fromEntries(
      (db.prepare('SELECT code, name_tr FROM categories').all() as Array<{ code: string; name_tr: string }>).map((c) => [
        c.code,
        c.name_tr,
      ]),
    );

    const buffer = await buildSimpleWorkbook(
      'Onaylı Tedarikçiler',
      [
        { header: 'Tedarikçi Kodu', key: 'supplier_code', width: 16 },
        { header: 'Firma Adı', key: 'company_name', width: 38 },
        { header: 'Vergi No', key: 'tax_id', width: 16 },
        { header: 'Kalite Notu', key: 'grade', width: 11 },
        { header: 'Durum', key: 'status', width: 16 },
        { header: 'Ürün Grupları', key: 'categories', width: 40 },
        { header: 'Ülke', key: 'country', width: 10 },
        { header: 'Şehir', key: 'city', width: 16 },
        { header: 'E-posta', key: 'email', width: 30 },
        { header: 'Telefon', key: 'phone', width: 18 },
        { header: 'OTD %', key: 'otd_percent', width: 10 },
        { header: 'PPM', key: 'ppm', width: 10 },
        { header: 'Açık Uygunsuzluk', key: 'open_ncrs', width: 18 },
        { header: 'Aktif Sözleşme', key: 'active_contracts', width: 16 },
        { header: 'Sonraki Denetim', key: 'next_audit_due', width: 16 },
        { header: 'Onay Tarihi', key: 'approved_at', width: 20 },
      ],
      rows.map((r) => ({
        ...r,
        categories: String(r.categories ?? '')
          .split(',')
          .filter(Boolean)
          .map((c) => catNames[c] ?? c)
          .join(', '),
      })),
      { exportedBy: `${req.user!.full_name} <${req.user!.email}>` },
    );

    logActivity({
      entityType: 'SYSTEM',
      entityId: 0,
      action: 'EXPORT_SUPPLIERS',
      actor: actorOf(req),
      detail: `${rows.length} kayıt`,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="onayli-tedarikciler-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  }),
);

supplierRoutes.get(
  '/:id',
  ah((req, res) => {
    const id = Number(req.params.id);
    const found = db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!found) throw notFound('Tedarikçi bulunamadı.');
    const supplier = stripSecret(found);

    const contracts = db.prepare('SELECT * FROM contracts WHERE supplier_id = ? ORDER BY end_date DESC').all(id);
    const ncrs = db.prepare('SELECT * FROM ncrs WHERE supplier_id = ? ORDER BY id DESC').all(id);
    const audits = db
      .prepare(
        `SELECT a.id, a.audit_no, a.type, a.status, a.planned_date, a.completed_at, a.score, a.grade, u.full_name AS auditor_name
           FROM audits a LEFT JOIN users u ON u.id = a.auditor_id
          WHERE a.supplier_id = ? ORDER BY a.id DESC`,
      )
      .all(id);
    const documents = db
      .prepare(
        `SELECT d.id, d.kind, d.original_name, d.mime_type, d.size_bytes, d.visibility, d.created_at,
                d.uploaded_by_supplier, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.owner_type = 'SUPPLIER' AND d.owner_id = ? ORDER BY d.id DESC`,
      )
      .all(id);
    const notes = db
      .prepare(
        `SELECT n.id, n.body, n.visibility, n.created_at, COALESCE(u.full_name, n.author_label) AS author
           FROM notes n LEFT JOIN users u ON u.id = n.author_id
          WHERE n.entity_type = 'SUPPLIER' AND n.entity_id = ? ORDER BY n.id DESC`,
      )
      .all(id);

    res.json({ ...supplier, contracts, ncrs, audits, documents, notes, activity: getActivity('SUPPLIER', id) });
  }),
);

const patchSchema = z.object({
  status: z.enum(['APPROVED', 'CONDITIONAL', 'SUSPENDED', 'BLACKLISTED', 'INACTIVE']).optional(),
  grade: z.enum(['A', 'B', 'C', 'D']).nullable().optional(),
  contact_name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(80).optional(),
  otd_percent: z.number().min(0).max(100).nullable().optional(),
  ppm: z.number().min(0).nullable().optional(),
  next_audit_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  categories: z.array(z.string().max(40)).max(30).optional(),
});

supplierRoutes.patch(
  '/:id',
  requireRole('MODERATOR', 'QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(patchSchema, req.body);
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as
      | { id: number; status: string; grade: string | null }
      | undefined;
    if (!supplier) throw notFound('Tedarikçi bulunamadı.');

    const { categories, ...fields } = body;
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      updates.push(`${k} = ?`);
      params.push(v);
    }
    if (updates.length) {
      db.prepare(`UPDATE suppliers SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);
    }

    if (categories) {
      db.prepare('DELETE FROM supplier_categories WHERE supplier_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO supplier_categories (supplier_id, category_code) VALUES (?, ?)');
      categories.forEach((c) => ins.run(id, c));
    }

    if (body.status && body.status !== supplier.status) {
      logActivity({
        entityType: 'SUPPLIER',
        entityId: id,
        action: 'STATUS_CHANGED',
        actor: actorOf(req),
        from: supplier.status,
        to: body.status,
      });
    }
    if (body.grade !== undefined && body.grade !== supplier.grade) {
      logActivity({
        entityType: 'SUPPLIER',
        entityId: id,
        action: 'GRADE_CHANGED',
        actor: actorOf(req),
        from: supplier.grade,
        to: body.grade,
      });
    }

    res.json(stripSecret(db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as Record<string, unknown>));
  }),
);

supplierRoutes.post(
  '/:id/notes',
  requireRole('MODERATOR', 'QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    if (!db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id)) throw notFound('Tedarikçi bulunamadı.');
    const created = db
      .prepare(`INSERT INTO notes (entity_type, entity_id, author_id, body) VALUES ('SUPPLIER', ?, ?, ?)`)
      .run(id, req.user!.id, body.body);
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

/**
 * Tedarikçiye portal davetini (parola oluşturma bağlantısı) yeniden gönderir.
 * Tedarikçi e-postayı kaybettiğinde veya adresi değiştiğinde kullanılır.
 */
supplierRoutes.post(
  '/:id/portal-invite',
  requireRole('MODERATOR', 'QUALITY'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const supplier = db.prepare('SELECT id, company_name, email, status, lang FROM suppliers WHERE id = ?').get(id) as
      | { id: number; company_name: string; email: string; status: string; lang: string }
      | undefined;
    if (!supplier) throw notFound('Tedarikçi bulunamadı.');
    if (!['APPROVED', 'CONDITIONAL'].includes(supplier.status)) {
      throw badRequest('Yalnızca onaylı tedarikçilere portal erişimi verilebilir.');
    }

    const token = randomToken();
    db.prepare(
      `INSERT INTO portal_tokens (token_hash, purpose, entity_type, entity_id, email, expires_at)
       VALUES (?, 'SET_PASSWORD', 'SUPPLIER', ?, ?, datetime('now','+14 days'))`,
    ).run(sha256(token), supplier.id, supplier.email);

    await notifyPortalInvite(supplier, token);
    logActivity({
      entityType: 'SUPPLIER',
      entityId: id,
      action: 'PORTAL_INVITE_SENT',
      actor: actorOf(req),
      detail: supplier.email,
    });
    res.json({ ok: true, message: 'Portal daveti tedarikçiye gönderildi.' });
  }),
);
