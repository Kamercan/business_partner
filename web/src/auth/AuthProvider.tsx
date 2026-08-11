import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../api/client';

export type Role = 'ADMIN' | 'MODERATOR' | 'QUALITY' | 'VIEWER';

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  locale: string;
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Rol kontrolü — ADMIN her yetkiyi kapsar. */
  can: (...roles: Role[]) => boolean;
  /** Salt okunur rol mü? */
  readOnly: boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    tokenStore.set(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.role === 'ADMIN') return true;
      return roles.includes(user.role);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, can, readOnly: user?.role === 'VIEWER' }),
    [user, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
