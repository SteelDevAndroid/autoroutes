import { useAppearanceStore } from '../state/appearanceStore';
import type { AppearancePreference } from './appearanceStorage';

/** A preference updates the UI and map paints without rebuilding the map. */
export function Appearance() {
  const appearance = useAppearanceStore((state) => state.preference);
  const setAppearance = useAppearanceStore((state) => state.setPreference);
  return <label className="appearance-control" htmlFor="appearance">Apparence
    <select id="appearance" aria-label="Apparence" value={appearance} onChange={(event) => { setAppearance(event.target.value as AppearancePreference); }}>
      <option value="system">Automatique</option><option value="light">Claire</option><option value="dark">Sombre</option>
    </select>
  </label>;
}
