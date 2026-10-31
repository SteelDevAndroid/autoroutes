import { useEffect, useState } from 'react';
import { loadAppearance, saveAppearance } from './appearanceStorage';
import type { AppearancePreference } from './appearanceStorage';

/** The appearance is independent of traffic palettes and never rebuilds the map. */
export function Appearance() {
  const [appearance, setAppearance] = useState(loadAppearance);
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    saveAppearance(appearance);
  }, [appearance]);
  return <label className="appearance-control" htmlFor="appearance">Apparence
    <select id="appearance" aria-label="Apparence" value={appearance} onChange={(event) => { setAppearance(event.target.value as AppearancePreference); }}>
      <option value="system">Automatique</option><option value="light">Claire</option><option value="dark">Sombre</option>
    </select>
  </label>;
}
