import { httpGet } from '../lib/http.js';
import { config } from '../config.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

const BASE = 'https://seffaflik.epias.com.tr/electricity-service/v1';
const TGT_URL = 'https://giris.epias.com.tr/cas/v1/tickets';

let cachedTgt: { token: string; at: number } | null = null;

/**
 * EPİAŞ Şeffaflık Platformu — Türkiye toptan elektrik piyasası.
 *
 * 2023 sonrasında servis kayıt ve TGT (ticket granting ticket) ile kimlik
 * doğrulama ister: EPIAS_USERNAME / EPIAS_PASSWORD ile jeton alınır, sonraki
 * isteklerde `TGT` başlığında gönderilir. Jeton iki saat önbelleklenir.
 */
export const epias: Connector = {
  id: 'epias',
  requiresEnv: 'EPIAS_USERNAME',
  async fetch(series, ctx) {
    const username = process.env.EPIAS_USERNAME;
    const password = process.env.EPIAS_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'EPIAS_USERNAME ve EPIAS_PASSWORD tanımlı değil. Ücretsiz kayıt: https://kayit.epias.com.tr/ ' +
        '(Şeffaflık Platformu hesabı). Kayıt olmadan PTF verisi alınamaz.',
      );
    }

    const tgt = await getTgt(username, password);
    const start = ctx.since ?? '2020-01-01';
    const end = new Date().toISOString().slice(0, 10);

    const res = await httpGet(
      `${BASE}/markets/dam/data/mcp?startDate=${start}T00:00:00+03:00&endDate=${end}T23:00:00+03:00`,
      { headers: { TGT: tgt, accept: 'application/json' } },
    );
    const body = (await res.json()) as { items?: { date: string; price: number }[] };
    const items = body.items ?? [];
    if (items.length === 0) throw new Error('EPİAŞ PTF sorgusu boş döndü — uç nokta veya tarih aralığını doğrulayın');

    // Saatlik PTF gelir; günlük ortalamaya indirgenir.
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const it of items) {
      const period = normalizePeriod(String(it.date).slice(0, 10), 'daily');
      const value = parseNumber(it.price);
      if (!period || value === null) continue;
      const acc = byDay.get(period) ?? { sum: 0, n: 0 };
      acc.sum += value; acc.n += 1;
      byDay.set(period, acc);
    }
    void series;
    return dedupe([...byDay.entries()].map(([period, a]) => ({ period, value: a.sum / a.n })));
  },
};

async function getTgt(username: string, password: string): Promise<string> {
  if (cachedTgt && Date.now() - cachedTgt.at < 2 * 60 * 60 * 1000) return cachedTgt.token;

  const res = await fetch(TGT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/plain' },
    body: new URLSearchParams({ username, password }),
    signal: AbortSignal.timeout(config.httpTimeoutMs),
  });
  if (!res.ok) throw new Error(`EPİAŞ girişi başarısız (HTTP ${res.status}) — kullanıcı adı/parolayı doğrulayın`);
  const token = (res.headers.get('location') ?? (await res.text())).trim().split('/').pop() ?? '';
  if (!token.startsWith('TGT')) throw new Error('EPİAŞ TGT jetonu alınamadı');
  cachedTgt = { token, at: Date.now() };
  return token;
}
