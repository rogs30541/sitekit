import { cookies } from 'next/headers';
import { API_INTERNAL_URL } from './api-public';

/** 需登入的伺服器端請求：轉發瀏覽器 cookie 給 api，永不快取。 */
export async function apiServer<T>(path: string, init?: RequestInit): Promise<T | null> {
  const cookie = (await cookies()).toString();
  try {
    const res = await fetch(`${API_INTERNAL_URL}${path}`, { ...init, cache: 'no-store', headers: { accept: 'application/json', ...(init?.headers ?? {}), cookie } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface Me {
  authenticated: boolean;
  user?: { id: string; email: string; displayName: string | null; role: 'user' | 'admin' | 'superadmin'; allowedFeatures: string[]; membershipTier: string | null };
}

export const getMe = () => apiServer<Me>('/api/auth/me');
