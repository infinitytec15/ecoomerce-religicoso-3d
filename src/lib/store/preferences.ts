'use client';
import { useSyncExternalStore } from 'react';
export function readPreference(key: string): string | null {
  try {
    const current = localStorage.getItem('meo-pref-' + key);
    if (current !== null) return current;
    const legacy = localStorage.getItem('amago-' + key);
    if (legacy === null) return null;
    try {
      const value: unknown = JSON.parse(legacy);
      return typeof value === 'string' ? value : legacy;
    } catch {
      return legacy;
    }
  } catch {
    return null;
  }
}
export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem('meo-pref-' + key, value);
    window.dispatchEvent(new Event('meo:preferences'));
  } catch {
    /* Preferences are optional; transactions use the gateway. */
  }
}
const subscribe = (callback: () => void) => {
  window.addEventListener('storage', callback);
  window.addEventListener('meo:preferences', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('meo:preferences', callback);
  };
};
export function usePreference(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readPreference(key),
    () => null,
  );
}
