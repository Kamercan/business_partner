import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/http.js';
import type { Role } from '../lib/constants.js';

export type AuthUser = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  locale: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Personel (Yanmar ekibi) oturum jetonu.
 *
 * `typ` alanı jeton türünü ayırır: tedarikçi portalı jetonları `supplier`
 * taşır ve bu middleware tarafından kesin olarak reddedilir. Böylece
 * tedarikçi oturumu hiçbir koşulda yönetim uçlarına erişemez.
 */
export function signToken(user: { id: number; email: string; role: Role }): string {
  return jwt.sign({ sub: String(user.id), email: user.email, role: user.role, typ: 'staff' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.bp_token;
  return cookie ?? null;
}

/**
 * Oturumu doğrular. Token geçerli olsa bile kullanıcı pasifleştirilmişse
 * erişim reddedilir (yetki iptali anında etkili olur).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

    // Tedarikçi jetonu yönetim uçlarında asla kabul edilmez.
    if (payload.typ === 'supplier') return next(forbidden('Bu alan yalnızca Yanmar ekibi içindir.'));

    const user = db
      .prepare('SELECT id, email, full_name, role, locale, is_active FROM users WHERE id = ?')
      .get(Number(payload.sub)) as (AuthUser & { is_active: number }) | undefined;

    if (!user || !user.is_active) return next(unauthorized('Hesabınız pasif durumda.'));
    req.user = { id: user.id, email: user.email, full_name: user.full_name, role: user.role, locale: user.locale };
    next();
  } catch {
    next(unauthorized('Oturum süresi doldu, lütfen tekrar giriş yapın.'));
  }
}

/** Belirtilen rollerden birine sahip olmayı zorunlu kılar. ADMIN her zaman geçer. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) return next();
    next(forbidden());
  };
}

/** Yazma işlemleri için: VIEWER rolü salt okunurdur. */
export const requireWrite = requireRole('MODERATOR', 'QUALITY');

export function actorOf(req: Request) {
  return { id: req.user?.id ?? null, label: req.user?.full_name ?? 'system' };
}
