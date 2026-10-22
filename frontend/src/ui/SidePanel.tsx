import { useMemo, useState } from 'react';
import type { StationCollection } from '../map/referentiel';
import { useUiStore } from '../state/uiStore';
import type { FlowKey } from '../state/uiStore';
import { Legend } from './Legend';
import { OdPanel } from './OdPanel';
import { Section } from './Section';
import { SegmentsPanel } from './SegmentsPanel';

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
      <input id="station-search" type="search" placeholder="Nom de gare…" value={query} onChange={(e) => { setQuery(e.target.value); }} aria-label="Nom de gare" />
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

export function SidePanel({ stations, onFocus, onFocusFlow, onResetView }: {
  readonly stations: StationCollection;
  readonly onFocus: (index: number) => void;
  readonly onFocusFlow: (flow: FlowKey) => void;
  readonly onResetView: () => void;
}) {
  const layers = useUiStore((s) => s.layers);
  const kinds = useUiStore((s) => s.kinds);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const toggleKind = useUiStore((s) => s.toggleKind);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const toggleDiagnostic = useUiStore((s) => s.toggleDiagnostic);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  return (
    <aside id="side-panel" className={`side${drawerOpen ? ' side-open' : ''}`} data-tour="panel">
      <Search stations={stations} onFocus={onFocus} />
      <Section id="layers" title="Couches et gares">
        <label><input type="checkbox" checked={kinds.has('ECHANGEUR')} onChange={() => { toggleKind('ECHANGEUR'); }} /> Gares d’échangeur</label>
        <label><input type="checkbox" checked={kinds.has('PLEINE_VOIE')} onChange={() => { toggleKind('PLEINE_VOIE'); }} /> Barrières pleine voie</label>
        <hr />
        <label><input type="checkbox" checked={layers.stations} onChange={() => { toggleLayer('stations'); }} /> Activité des gares</label>
        <label><input type="checkbox" checked={layers.labels} onChange={() => { toggleLayer('labels'); }} /> Noms des gares</label>
        <label><input type="checkbox" checked={layers.axes} onChange={() => { toggleLayer('axes'); }} /> Noms des autoroutes</label>
        <label><input type="checkbox" checked={layers.od} onChange={() => { toggleLayer('od'); }} /> Flux origine → destination</label>
        <label><input type="checkbox" checked={layers.segments} onChange={() => { toggleLayer('segments'); }} /> Charge des tronçons (estimée)</label>
        <label><input type="checkbox" checked={reducedMotion} onChange={(e) => { setReducedMotion(e.target.checked); }} /> Réduire les animations</label>
      </Section>
      {layers.od && <OdPanel stations={stations} onFocusFlow={onFocusFlow} />}
      {layers.segments && <SegmentsPanel />}
      <Legend />
      <section className="side-actions">
        <button type="button" className="icon-button" onClick={onResetView}>Vue France entière</button>{' '}
        <button type="button" className="icon-button" onClick={toggleDiagnostic}>Diagnostic</button>
      </section>
    </aside>
  );
}
