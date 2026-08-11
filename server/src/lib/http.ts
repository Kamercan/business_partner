import type { NextFunction, Request, Response } from 'express';
import { ZodError, type TypeOf, type ZodTypeAny } from 'zod';

/** İstemciye dönülebilir, kontrollü hata. */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Oturum gerekli.') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Bu işlem için yetkiniz yok.') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Kayıt bulunamadı.') => new AppError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, details?: unknown) => new AppError(409, msg, 'CONFLICT', details);

/** async route handler'ları için hata yakalayıcı sarmalayıcı. */
export function ah<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown> | unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/**
 * Zod şeması ile gövde/query doğrulama.
 * Şemanın çıktı tipini döndürür — `.default()` kullanan alanlar sonuçta
 * zorunlu olur, çağıran tarafta gereksiz `undefined` kontrolü kalmaz.
 */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): TypeOf<S> {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw badRequest('Gönderilen veri geçersiz.', details);
    }
    throw err;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  // Multer / diğer kütüphane hataları
  const anyErr = err as { code?: string; message?: string };
  if (anyErr?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Dosya boyutu izin verilen sınırı aşıyor.', code: 'FILE_TOO_LARGE' });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.', code: 'INTERNAL' });
}
