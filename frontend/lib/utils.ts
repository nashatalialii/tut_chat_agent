import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const SESSION_KEY = 'egypt-traffic-session-id';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getOrCreateSessionId() {
  if (typeof window === 'undefined') return 'server-session';
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

export function resetSessionId() {
  if (typeof window === 'undefined') return 'server-session';
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}


const ADMIN_TOKEN_KEY = 'egypt-traffic-admin-token';

export function getAdminToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  if (token.trim()) sessionStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}
