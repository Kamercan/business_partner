import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { DEMO_SUPPLIER_HASH_KEY, DEMO_SUPPLIER_PASSWORD } from '../db/bootstrap.js';
import { db, getSetting, setSetting } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { APPLICATION_STATUSES, COUNTRIES, EMPLOYEE_BANDS, REVENUE_BANDS } from '../lib/constants.js';
import { ah, notFound, parse } from '../lib/http.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const metaRoutes = Router();

/**
 * Demo modunda, portal girişini denemek için kullanılabilecek onaylı
 * tedarikçiler. Yalnızca parolası hâlâ demo parolası olanlar listelenir —
 * tedarikçi kendi parolasını belirlediği anda özeti değişir ve listeden
 * düşer. Demo modu kapalıyken liste her zaman boştur.
 */
function demoSupplierLogins(): Array<{ company_name: string; email: string; password: string }> {
  if (!config.demoMode) return [];
  const hash = getSetting(DEMO_SUPPLIER_HASH_KEY, '');
  if (!hash) return [];
  const rows = db
    .prepare(
      `SELECT company_name, email FROM suppliers
        WHERE password_hash = ? AND status IN ('APPROVED','CONDITIONAL')
        ORDER BY id LIMIT 3`,
    )
    .all(hash) as Array<{ company_name: string; email: string }>;
  return rows.map((r) => ({ ...r, password: DEMO_SUPPLIER_PASSWORD }));
}

/**
 * Kamuya açık referans veriler — başvuru formu bu uçtan beslenir.
 * Yeni bir ürün grubu eklendiğinde form kendiliğinden güncellenir.
 */
metaRoutes.get(
  '/',
  ah((_req, res) => {
    const categories = db
      .prepare('SELECT code, name_tr, name_en, name_ja, hint_tr, hint_en, hint_ja FROM categories WHERE is_active = 1 ORDER BY sort_order, id')
      .all();
    const certifications = db
      .prepare('SELECT code, name, description_tr, description_en, description_ja FROM certifications WHERE is_active = 1 ORDER BY sort_order, id')
      .all();
    const sectors = db
      .prepare('SELECT code, name_tr, name_en, name_ja FROM sectors WHERE is_active = 1 ORDER BY sort_order, id')
      .all();

    res.json({
      categories,
      certifications,
      sectors,
      countries: COUNTRIES,
      employeeBands: EMPLOYEE_BANDS,
      revenueBands: REVENUE_BANDS,
      statuses: APPLICATION_STATUSES,
      org: { name: getSetting('org.name', 'Yanmar Türkiye Makine Sanayi A.Ş.'), short: getSetting('org.short', 'Yanmar Türkiye') },
      /** Demo modunda giriş ekranı örnek hesapları gösterir. */
      demoMode: config.demoMode,
      demoSuppliers: demoSupplierLogins(),
      sla: {
        reviewDays: Number(getSetting('sla.review_days', '10')),
        auditDays: Number(getSetting('sla.audit_days', '30')),
        ncrResponseDays: Number(getSetting('sla.ncr_response_days', '14')),
      },
    });
  }),
);

// --------------------------- Yönetim: ayarlar ------------------------------

metaRoutes.get(
  '/settings',
  requireAuth,
  ah((_req, res) => {
    const rows = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all();
    res.json(rows);
  }),
);

metaRoutes.put(
  '/settings',
  requireAuth,
  requireRole('ADMIN'),
  ah((req, res) => {
    const body = parse(z.record(z.string().max(60), z.string().max(500)), req.body);
    for (const [key, value] of Object.entries(body)) {
      const previous = getSetting(key, '');
      setSetting(key, value);
      logActivity({
        entityType: 'SYSTEM',
        entityId: 0,
        action: 'SETTING_CHANGED',
        actor: actorOf(req),
        from: previous,
        to: value,
        detail: key,
      });
    }
    res.json({ ok: true });
  }),
);

// --------------------------- Yönetim: taksonomi ----------------------------

const categorySchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, 'Kod yalnızca küçük harf, rakam ve _ içerebilir.'),
  name_tr: z.string().trim().min(2).max(120),
  name_en: z.string().trim().min(2).max(120),
  /** Japonca isteğe bağlıdır — girilmezse arayüz İngilizceye düşer. */
  name_ja: z.string().trim().max(120).nullable().optional(),
  hint_tr: z.string().trim().max(500).nullable().optional(),
  hint_en: z.string().trim().max(500).nullable().optional(),
  hint_ja: z.string().trim().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
});

metaRoutes.post(
  '/categories',
  requireAuth,
  requireRole('ADMIN'),
  ah((req, res) => {
    const body = parse(categorySchema, req.body);
    db.prepare(
      `INSERT INTO categories (code, name_tr, name_en, name_ja, hint_tr, hint_en, hint_ja, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name_tr = excluded.name_tr, name_en = excluded.name_en,
         name_ja = excluded.name_ja, hint_tr = excluded.hint_tr, hint_en = excluded.hint_en,
         hint_ja = excluded.hint_ja, sort_order = excluded.sort_order, is_active = excluded.is_active`,
    ).run(
      body.code, body.name_tr, body.name_en, body.name_ja || null,
      body.hint_tr ?? null, body.hint_en ?? null, body.hint_ja || null,
      body.sort_order, body.is_active ? 1 : 0,
    );
    logActivity({ entityType: 'SYSTEM', entityId: 0, action: 'CATEGORY_SAVED', actor: actorOf(req), to: body.code });
    res.status(201).json({ ok: true });
  }),
);

/** Kategori silinmez, pasifleştirilir — geçmiş başvurulardaki referans korunur. */
metaRoutes.delete(
  '/categories/:code',
  requireAuth,
  requireRole('ADMIN'),
  ah((req, res) => {
    const found = db.prepare('SELECT code FROM categories WHERE code = ?').get(req.params.code);
    if (!found) throw notFound('Ürün grubu bulunamadı.');
    db.prepare('UPDATE categories SET is_active = 0 WHERE code = ?').run(req.params.code);
    logActivity({
      entityType: 'SYSTEM',
      entityId: 0,
      action: 'CATEGORY_DEACTIVATED',
      actor: actorOf(req),
      to: req.params.code,
    });
    res.json({ ok: true });
  }),
);

const certSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(2).max(80),
  description_tr: z.string().trim().max(300).nullable().optional(),
  description_en: z.string().trim().max(300).nullable().optional(),
  description_ja: z.string().trim().max(300).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
});

metaRoutes.post(
  '/certifications',
  requireAuth,
  requireRole('ADMIN'),
  ah((req, res) => {
    const body = parse(certSchema, req.body);
    db.prepare(
      `INSERT INTO certifications (code, name, description_tr, description_en, description_ja, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name = excluded.name, description_tr = excluded.description_tr,
         description_en = excluded.description_en, description_ja = excluded.description_ja,
         sort_order = excluded.sort_order, is_active = excluded.is_active`,
    ).run(
      body.code, body.name, body.description_tr ?? null, body.description_en ?? null,
      body.description_ja || null, body.sort_order, body.is_active ? 1 : 0,
    );
    res.status(201).json({ ok: true });
  }),
);
