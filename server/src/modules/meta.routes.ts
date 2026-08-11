import { Router } from 'express';
import { z } from 'zod';
import { db, getSetting, setSetting } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  COUNTRIES,
  EMPLOYEE_BANDS,
  REVENUE_BANDS,
} from '../lib/constants.js';
import { ah, notFound, parse } from '../lib/http.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const metaRoutes = Router();

/**
 * Kamuya açık referans veriler — başvuru formu bu uçtan beslenir.
 * Yeni bir ürün grubu eklendiğinde form kendiliğinden güncellenir.
 */
metaRoutes.get(
  '/',
  ah((_req, res) => {
    const categories = db
      .prepare('SELECT code, name_tr, name_en, hint_tr, hint_en FROM categories WHERE is_active = 1 ORDER BY sort_order, id')
      .all();
    const certifications = db
      .prepare('SELECT code, name, description_tr, description_en FROM certifications WHERE is_active = 1 ORDER BY sort_order, id')
      .all();
    const sectors = db
      .prepare('SELECT code, name_tr, name_en FROM sectors WHERE is_active = 1 ORDER BY sort_order, id')
      .all();

    res.json({
      categories,
      certifications,
      sectors,
      countries: COUNTRIES,
      employeeBands: EMPLOYEE_BANDS,
      revenueBands: REVENUE_BANDS,
      statuses: APPLICATION_STATUSES,
      sources: APPLICATION_SOURCES,
      org: { name: getSetting('org.name', 'Yanmar Türkiye Makine Sanayi A.Ş.'), short: getSetting('org.short', 'Yanmar Türkiye') },
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
  hint_tr: z.string().trim().max(500).nullable().optional(),
  hint_en: z.string().trim().max(500).nullable().optional(),
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
      `INSERT INTO categories (code, name_tr, name_en, hint_tr, hint_en, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name_tr = excluded.name_tr, name_en = excluded.name_en,
         hint_tr = excluded.hint_tr, hint_en = excluded.hint_en,
         sort_order = excluded.sort_order, is_active = excluded.is_active`,
    ).run(
      body.code, body.name_tr, body.name_en, body.hint_tr ?? null, body.hint_en ?? null,
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
      `INSERT INTO certifications (code, name, description_tr, description_en, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name = excluded.name, description_tr = excluded.description_tr,
         description_en = excluded.description_en, sort_order = excluded.sort_order, is_active = excluded.is_active`,
    ).run(body.code, body.name, body.description_tr ?? null, body.description_en ?? null, body.sort_order, body.is_active ? 1 : 0);
    res.status(201).json({ ok: true });
  }),
);
