import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/http.js';

export type SupplierSession = {
  id: number;
  supplier_code: string;
  company_name: string;
  email: string;
  status: string;
  grade: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supplier?: SupplierSession;
    }
  }
}

/** Portala girebilecek tedarikçi durumları — "yalnızca onaylı tedarikçiler". */
export const PORTAL_ALLOWED_STATUSES = ['APPROVED', 'CONDITIONAL'] as const;

export function signSupplierToken(supplier: { id: number; email: string }): string {
  return jwt.sign({ sub: String(supplier.id), email: supplier.email, typ: 'supplier' }, config.jwtSecret, {
    expiresIn: '12h',
  } as jwt.SignOptions);
}

/**
 * Tedarikçi portalı oturumu.
 *
 * Yalnızca `typ: 'supplier'` taşıyan jetonlar kabul edilir; personel jetonu
 * buraya geçemez. Her istekte tedarikçinin güncel durumu okunur — askıya
 * alınan veya kara listeye düşen tedarikçinin oturumu anında kapanır.
 */
export function requireSupplier(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.bp_supplier_token;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : cookie;
  if (!token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (payload.typ !== 'supplier') return next(forbidden('Bu alan tedarikçi girişi içindir.'));

    const supplier = db
      .prepare('SELECT id, supplier_code, company_name, email, status, grade, password_hash FROM suppliers WHERE id = ?')
      .get(Number(payload.sub)) as (SupplierSession & { password_hash: string | null }) | undefined;

    if (!supplier || !supplier.password_hash) return next(unauthorized('Portal erişiminiz bulunmuyor.'));
    if (!PORTAL_ALLOWED_STATUSES.includes(supplier.status as 'APPROVED')) {
      return next(forbidden('Tedarikçi kaydınız şu anda portal erişimine açık değil. Lütfen Yanmar ekibiyle iletişime geçin.'));
    }

    req.supplier = {
      id: supplier.id,
      supplier_code: supplier.supplier_code,
      company_name: supplier.company_name,
      email: supplier.email,
      status: supplier.status,
      grade: supplier.grade,
    };
    next();
  } catch {
    next(unauthorized('Oturum süresi doldu, lütfen tekrar giriş yapın.'));
  }
}
