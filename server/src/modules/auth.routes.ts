import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { ah, badRequest, parse, unauthorized } from '../lib/http.js';
import { actorOf, requireAuth, signToken, type AuthUser } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';

export const authRoutes = Router();

const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta giriniz.'),
  password: z.string().min(1, 'Şifre zorunludur.'),
});

authRoutes.post(
  '/login',
  loginLimiter,
  ah((req, res) => {
    const body = parse(loginSchema, req.body);
    const user = db
      .prepare('SELECT id, email, password_hash, full_name, role, locale, is_active FROM users WHERE lower(email) = lower(?)')
      .get(body.email) as
      | (AuthUser & { password_hash: string; is_active: number })
      | undefined;

    // Kullanıcı yoksa da aynı süre harcanır (zamanlama saldırısına karşı).
    const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const ok = bcrypt.compareSync(body.password, hash);

    if (!user || !ok) throw unauthorized('E-posta veya şifre hatalı.');
    if (!user.is_active) throw unauthorized('Hesabınız pasif durumda. Yöneticinizle iletişime geçin.');

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    logActivity({
      entityType: 'USER',
      entityId: user.id,
      action: 'LOGIN',
      actor: { id: user.id, label: user.full_name },
    });

    const token = signToken(user);
    res.cookie('bp_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, locale: user.locale },
    });
  }),
);

authRoutes.post('/logout', (_req, res) => {
  res.clearCookie('bp_token');
  res.json({ ok: true });
});

authRoutes.get(
  '/me',
  requireAuth,
  ah((req, res) => {
    res.json({ user: req.user });
  }),
);

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(8, 'Yeni şifre en az 8 karakter olmalıdır.')
    .max(200)
    .regex(/[A-Za-z]/, 'Şifre en az bir harf içermelidir.')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermelidir.'),
});

authRoutes.post(
  '/change-password',
  requireAuth,
  ah((req, res) => {
    const body = parse(passwordSchema, req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as {
      password_hash: string;
    };
    if (!bcrypt.compareSync(body.current_password, row.password_hash)) {
      throw badRequest('Mevcut şifreniz hatalı.');
    }
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      bcrypt.hashSync(body.new_password, 10),
      req.user!.id,
    );
    logActivity({ entityType: 'USER', entityId: req.user!.id, action: 'PASSWORD_CHANGED', actor: actorOf(req) });
    res.json({ ok: true });
  }),
);

authRoutes.patch(
  '/preferences',
  requireAuth,
  ah((req, res) => {
    const body = parse(z.object({ locale: z.enum(['tr', 'en']) }), req.body);
    db.prepare('UPDATE users SET locale = ? WHERE id = ?').run(body.locale, req.user!.id);
    res.json({ ok: true, locale: body.locale });
  }),
);
