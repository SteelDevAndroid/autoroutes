import { create } from 'zustand';
import type { MapAppearance } from '../map/theme';
import { loadAppearance, saveAppearance } from '../ui/appearanceStorage';
import type { AppearancePreference } from '../ui/appearanceStorage';

interface AppearanceState {
  readonly preference: AppearancePreference;
  readonly scheme: MapAppearance;
  readonly systemDark: boolean;
  readonly setPreference: (preference: AppearancePreference) => void;
  readonly setSystemDark: (dark: boolean) => void;
}

const resolve = (preference: AppearancePreference, dark: boolean): MapAppearance => preference === 'system'
  ? dark ? 'dark' : 'light' : preference;
const initial = loadAppearance();

/** Appearance is independent of traffic data, filters and colorblind settings. */
export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  preference: initial, scheme: resolve(initial, false), systemDark: false,
  setPreference: (preference) => {
    saveAppearance(preference);
    set({ preference, scheme: resolve(preference, get().systemDark) });
  },
  setSystemDark: (systemDark) => { set({ systemDark, scheme: resolve(get().preference, systemDark) }); },
}));

/** One OS listener for the whole app; the initial scheme is applied before mounting MapLibre. */
export function startAppearance(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => { useAppearanceStore.getState().setSystemDark(query.matches); };
  update();
  document.documentElement.dataset.appearance = useAppearanceStore.getState().preference;
  const unsubscribe = useAppearanceStore.subscribe((state) => { document.documentElement.dataset.appearance = state.preference; });
  query.addEventListener('change', update);
  return () => { query.removeEventListener('change', update); unsubscribe(); };
}
