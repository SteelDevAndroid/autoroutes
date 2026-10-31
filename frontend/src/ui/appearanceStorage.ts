export type AppearancePreference = 'system' | 'light' | 'dark';
const KEY = 'supervision.appearance.v1';

export function loadAppearance(): AppearancePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}

export function saveAppearance(value: AppearancePreference): void {
  try { localStorage.setItem(KEY, value); } catch { /* Session-only preference. */ }
}
