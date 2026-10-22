import { useMemo, useState } from 'react';
import type { StationCollection } from '../map/referentiel';
import { config } from '../config';
import { theme } from '../map/theme';
import { useUiStore } from '../state/uiStore';
import { OdPanel } from './OdPanel';
import { SegmentsPanel } from './SegmentsPanel';
import { ReplayPanel } from './ReplayPanel';
import type { ReplayControls } from './ReplayPanel';

const normalize = (value: string): string =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

function Search({ stations, onFocus }: { readonly stations: StationCollection; readonly onFocus: (index: number) => void }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) {
      return [];
    }
    return stations.features
      .map((feature, index) => ({ index, name: feature.properties.name, key: normalize(feature.properties.name) }))
      .filter((s) => s.key.includes(q))
      .slice(0, 12);
  }, [query, stations]);
  return (
    <section className="search" aria-label="Recherche de gare">
      <h2>Rechercher</h2>
      <input type="search" placeholder="Nom de gare…" value={query} onChange={(e) => { setQuery(e.target.value); }} aria-label="Nom de gare" />
      {matches.length > 0 && (
        <ul>
          {matches.map((m) => (
            <li key={m.index}><button type="button" onClick={() => { onFocus(m.index); }}>{m.name}</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SidePanel({ stations, onFocus, onResetView, replay }: {
  readonly stations: StationCollection;
  readonly onFocus: (index: number) => void;
  readonly onResetView: () => void;
  readonly replay: ReplayControls;
}) {
  const layers = useUiStore((s) => s.layers);
  const kinds = useUiStore((s) => s.kinds);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const toggleKind = useUiStore((s) => s.toggleKind);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const toggleDiagnostic = useUiStore((s) => s.toggleDiagnostic);
  return (
    <aside className="side">
      <Search stations={stations} onFocus={onFocus} />
      <section>
        <h2>Gares</h2>
        <label><input type="checkbox" checked={kinds.has('ECHANGEUR')} onChange={() => { toggleKind('ECHANGEUR'); }} /> Gares d’échangeur</label>
        <label><input type="checkbox" checked={kinds.has('PLEINE_VOIE')} onChange={() => { toggleKind('PLEINE_VOIE'); }} /> Barrières pleine voie</label>
      </section>
      <section>
        <h2>Couches</h2>
        <label><input type="checkbox" checked={layers.stations} onChange={() => { toggleLayer('stations'); }} /> Activité des gares</label>
        <label><input type="checkbox" checked={layers.labels} onChange={() => { toggleLayer('labels'); }} /> Noms des gares</label>
        <label><input type="checkbox" checked={layers.od} onChange={() => { toggleLayer('od'); }} /> Flux origine → destination</label>
        <label><input type="checkbox" checked={layers.segments} onChange={() => { toggleLayer('segments'); }} /> Charge des tronçons (estimée)</label>
        <label><input type="checkbox" checked={reducedMotion} onChange={(e) => { setReducedMotion(e.target.checked); }} /> Réduire les animations</label>
      </section>
      {layers.od && <OdPanel stations={stations} />}
      {layers.segments && <SegmentsPanel />}
      {!config.demo && <ReplayPanel controls={replay} />}
      <section aria-label="Légende">
        <h2>Légende</h2>
        <div className="legend-row"><span className="swatch" style={{ background: theme.stationEchangeur }} /> Gare d’échangeur</div>
        <div className="legend-row"><span className="swatch" style={{ background: theme.stationPleineVoie, outline: '2px solid #e6edf3' }} /> Barrière pleine voie</div>
        <div className="legend-row"><span className="swatch" style={{ background: theme.stationStale }} /> Gare sans données récentes</div>
        <p className="note">Surface du cercle ∝ passages sur 1 h (observés). Halo bref = nouveaux passages.</p>
        <div className="legend-row"><span className="swatch-line" style={{ borderColor: theme.odFlow }} /> Flux O/D observé (≥ 3 véh. sur 1 h, seuil appliqué après regroupement), clair → foncé = origine → destination</div>
        <div className="legend-row"><span className="swatch-line swatch-dashed" style={{ borderColor: theme.segmentRamp[3] }} /> Charge de tronçon <strong>estimée</strong></div>
        <p className="note">Données de péage : le trafic gratuit et les trajets entre deux gares ne sont pas mesurés.</p>
      </section>
      <section>
        <button type="button" className="icon-button" onClick={onResetView}>Vue France entière</button>{' '}
        <button type="button" className="icon-button" onClick={toggleDiagnostic}>Diagnostic</button>
      </section>
    </aside>
  );
}
