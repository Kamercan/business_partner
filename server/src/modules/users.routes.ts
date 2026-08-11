import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { ROLES } from '../lib/constants.js';
import { ah, badRequest, conflict, notFound, parse } from '../lib/http.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const userRoutes = Router();
userRoutes.use(requireAuth);

/** Atama açılır listeleri için hafif kullanıcı listesi (tüm roller görebilir). */
userRoutes.get(
  '/',
  ah((req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const rows = db
      .prepare(
        `SELECT id, email, full_name, role, department, is_active, last_login_at, created_at
           FROM users
          WHERE is_active = 1 ${role ? 'AND role = ?' : ''}
          ORDER BY full_name COLLATE NOCASE`,
      )
      .all(...(role ? [role] : []));
    res.json(rows);
  }),
);

userRoutes.get(
  '/all',
  requireRole('ADMIN'),
  ah((_req, res) => {
    const rows = db
      .prepare(
        'SELECT id, email, full_name, role, department, phone, locale, is_active, last_login_at, created_at FROM users ORDER BY id',
      )
      .all();
    res.json(rows);
  }),
);

const createSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta giriniz.').max(160),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  department: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  password: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalıdır.')
    .max(200)
    .regex(/[A-Za-z]/, 'Şifre en az bir harf içermelidir.')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermelidir.'),
});

userRoutes.post(
  '/',
  requireRole('ADMIN'),
  ah((req, res) => {
    const body = parse(createSchema, req.body);
    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(body.email);
    if (exists) throw conflict('Bu e-posta adresi zaten kayıtlı.');

    const created = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, role, department, phone)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(body.email, bcrypt.hashSync(body.password, 10), body.full_name, body.role, body.department ?? null, body.phone ?? null);

    logActivity({
      entityType: 'USER',
      entityId: created.lastInsertRowid as number,
      action: 'USER_CREATED',
      actor: actorOf(req),
      to: `${body.full_name} (${body.role})`,
    });
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

const patchSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  department: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  is_active: z.boolean().optional(),
  password: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Za-z]/, 'Şifre en az bir harf içermelidir.')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermelidir.')
    .optional(),
});

userRoutes.patch(
  '/:id',
  requireRole('ADMIN'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(patchSchema, req.body);
    const user = db.prepare('SELECT id, role, is_active, full_name FROM users WHERE id = ?').get(id) as
      | { id: number; role: string; is_active: number; full_name: string }
      | undefined;
    if (!user) throw notFound('Kullanıcı bulunamadı.');

    // Son aktif yöneticinin devre dışı kalmasını / rol düşürmesini engelle.
    const disablingAdmin =
      user.role === 'ADMIN' && ((body.is_active === false) || (body.role !== undefined && body.role !== 'ADMIN'));
    if (disablingAdmin) {
      const activeAdmins = (
        db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id != ?").get(id) as {
          c: number;
        }
      ).c;
      if (activeAdmins === 0) throw badRequest('Sistemde en az bir aktif yönetici kalmalıdır.');
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || k === 'password') continue;
      updates.push(`${k} = ?`);
      params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    if (body.password) {
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(body.password, 10));
    }
    if (updates.length === 0) throw badRequest('Güncellenecek alan gönderilmedi.');

    db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);
    logActivity({
      entityType: 'USER',
      entityId: id,
      action: body.password ? 'USER_PASSWORD_RESET' : 'USER_UPDATED',
      actor: actorOf(req),
      to: user.full_name,
    });
    res.json({ ok: true });
  }),
);
