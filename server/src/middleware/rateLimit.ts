import rateLimit from 'express-rate-limit';

/** Kamuya açık başvuru formu — aynı IP'den saatte en fazla 5 başvuru. */
export const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla başvuru gönderildi. Lütfen bir süre sonra tekrar deneyin.', code: 'RATE_LIMITED' },
});

/** Giriş denemeleri — kaba kuvvet saldırılarına karşı. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.', code: 'RATE_LIMITED' },
});

/** Tedarikçi self-servis bağlantıları. */
export const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Genel API koruması. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
