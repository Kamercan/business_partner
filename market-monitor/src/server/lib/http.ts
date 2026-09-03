import { config } from '../config.js';

export class FetchError extends Error {
  constructor(message: string, readonly status?: number, readonly url?: string) {
    super(message);
    this.name = 'FetchError';
  }
}

const UA = 'market-monitor/1.0 (kurum içi gösterge panosu)';

/** Zaman aşımı, yeniden deneme ve anlaşılır hata mesajı ile fetch. */
export async function httpGet(
  url: string,
  opts: { headers?: Record<string, string>; retries?: number; accept?: string } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.httpTimeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: opts.accept ?? 'application/json,text/csv,*/*', ...opts.headers },
      });
      if (res.status === 429 || res.status >= 500) {
        // Geçici hata — geri çekilip yeniden dene.
        throw new FetchError(`Kaynak ${res.status} döndürdü`, res.status, url);
      }
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        throw new FetchError(`HTTP ${res.status}${body ? ` — ${body}` : ''}`, res.status, url);
      }
      return res;
    } catch (err) {
      lastError = err;
      const permanent = err instanceof FetchError && err.status !== undefined && err.status < 500 && err.status !== 429;
      if (permanent || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof FetchError) throw lastError;
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new FetchError(msg.includes('abort') ? 'Zaman aşımı' : msg, undefined, url);
}

export async function getJson<T = unknown>(url: string, opts?: Parameters<typeof httpGet>[1]): Promise<T> {
  const res = await httpGet(url, opts);
  return (await res.json()) as T;
}

export async function getText(url: string, opts?: Parameters<typeof httpGet>[1]): Promise<string> {
  const res = await httpGet(url, opts);
  return res.text();
}
