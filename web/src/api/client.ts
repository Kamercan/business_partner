const TOKEN_KEY = 'bp_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }

  /** Alan bazlı doğrulama hatalarını forma bağlamak için sözlüğe çevirir. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    this.details?.forEach((d) => {
      out[d.field] = d.message;
    });
    return out;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

type Options = {
  method?: string;
  body?: unknown;
  /** FormData gönderiliyorsa Content-Type belirlenmez. */
  form?: FormData;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`/api${path}`, {
    method: options.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new ApiError(res.status, `Sunucu hatası (${res.status})`);
    return (await res.blob()) as T;
  }

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) tokenStore.clear();
    throw new ApiError(res.status, data.error ?? 'Beklenmeyen bir hata oluştu.', data.code, data.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData, method = 'POST') => request<T>(path, { method, form }),

  /** Dosya indirir ve tarayıcıda kaydetme akışını başlatır. */
  async download(path: string, fallbackName: string): Promise<void> {
    const token = tokenStore.get();
    const res = await fetch(`/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      let message = `İndirme başarısız (${res.status})`;
      try {
        const data = await res.json();
        message = data.error ?? message;
      } catch {
        /* gövde JSON değil */
      }
      throw new ApiError(res.status, message);
    }

    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : fallbackName;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

/** Query string üretici — boş değerleri atar, dizileri virgülle birleştirir. */
export function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}
