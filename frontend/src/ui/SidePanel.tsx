import type { AxisGroup } from '../map/axes';
import { config } from '../config';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import type { FlowKey } from '../state/uiStore';
import { ActivityPanel } from './ActivityPanel';
import { Legend } from './Legend';
import { OdPanel } from './OdPanel';
import { SearchBox } from './SearchBox';
import { Section } from './Section';
import { SegmentsPanel } from './SegmentsPanel';

export function SidePanel({ stations, store, onFocus, onFocusAxis, onFocusFlow, onResetView }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onFocus: (index: number) => void;
  readonly onFocusAxis: (group: AxisGroup) => void;
  readonly onFocusFlow: (flow: FlowKey) => void;
  readonly onResetView: () => void;
}) {
  const layers = useUiStore((s) => s.layers);
  const kinds = useUiStore((s) => s.kinds);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const toggleKind = useUiStore((s) => s.toggleKind);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const palette = useUiStore((s) => s.palette);
  const setPalette = useUiStore((s) => s.setPalette);
  const toggleDiagnostic = useUiStore((s) => s.toggleDiagnostic);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const segmentCapability = useUiStore((s) => s.capabilities?.segments);
  const segmentsUnavailable = !config.demo && segmentCapability !== 'READY';
  return (
    <aside id="side-panel" className={`side${drawerOpen ? ' side-open' : ''}`} data-tour="panel">
      <SearchBox stations={stations} onFocusStation={onFocus} onFocusAxis={onFocusAxis} />
      <Section id="layers" title="Couches et gares">
        <label><input type="checkbox" checked={kinds.has('ECHANGEUR')} onChange={() => { toggleKind('ECHANGEUR'); }} /> Gares d’échangeur</label>
        <label><input type="checkbox" checked={kinds.has('PLEINE_VOIE')} onChange={() => { toggleKind('PLEINE_VOIE'); }} /> Barrières pleine voie</label>
        <hr />
        <label><input type="checkbox" checked={layers.stations} onChange={() => { toggleLayer('stations'); }} /> Activité des gares</label>
        <label><input type="checkbox" checked={layers.labels} onChange={() => { toggleLayer('labels'); }} /> Noms des gares</label>
        <label><input type="checkbox" checked={layers.axes} onChange={() => { toggleLayer('axes'); }} /> Noms des autoroutes</label>
        <label><input type="checkbox" checked={layers.od} onChange={() => { toggleLayer('od'); }} /> Flux origine → destination</label>
        <label><input type="checkbox" checked={layers.segments} disabled={segmentsUnavailable} aria-describedby={segmentsUnavailable ? 'segments-availability' : undefined} onChange={() => { toggleLayer('segments'); }} /> Charge des tronçons (estimée)</label>
        {segmentsUnavailable && <p id="segments-availability" className="note">{segmentCapability === 'DISABLED'
          ? 'Estimation indisponible : aucun graphe routier activé.'
          : segmentCapability === 'STARTING' ? 'Le premier calcul des tronçons est en cours.'
          : 'Disponibilité des tronçons non vérifiée. Nouvelle vérification automatique.'}</p>}
        <label><input type="checkbox" checked={palette === 'cvd'} onChange={(e) => { setPalette(e.target.checked ? 'cvd' : 'default'); }} /> Couleurs adaptées au daltonisme</label>
        <label><input type="checkbox" checked={reducedMotion} onChange={(e) => { setReducedMotion(e.target.checked); }} /> Réduire les animations</label>
      </Section>
      <ActivityPanel stations={stations} store={store} onFocus={onFocus} />
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
