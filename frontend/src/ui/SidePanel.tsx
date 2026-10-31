import type { AxisGroup } from '../map/axes';
import { config } from '../config';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import type { FlowKey } from '../state/uiStore';
import { GlassSidebar, SpatialButton } from './Spatial';
import { Appearance } from './Appearance';
import { Icon } from './Icon';
import { useCompact } from './useCompact';
import { ActivityPanel } from './ActivityPanel';
import { Legend } from './Legend';
import { OdPanel } from './OdPanel';
import { ActiveFilters } from './ActiveFilters';
import { SearchBox } from './SearchBox';
import { Section } from './Section';
import { SegmentsPanel } from './SegmentsPanel';
import { AxisSummary } from './AxisSummary';

export function SidePanel({ stations, store, onFocus, onFocusAxis, onFocusFlow, onResetView }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onFocus: (index: number) => void;
  readonly onFocusAxis: (group: AxisGroup) => void;
  readonly onFocusFlow: (flow: FlowKey) => void;
  readonly onResetView: () => void;
}) {
  const compact = useCompact();
  const layers = useUiStore((s) => s.layers);
  const kinds = useUiStore((s) => s.kinds);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const toggleKind = useUiStore((s) => s.toggleKind);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const palette = useUiStore((s) => s.palette);
  const setPalette = useUiStore((s) => s.setPalette);
  const diagnosticOpen = useUiStore((s) => s.diagnosticOpen);
  const toggleDiagnostic = useUiStore((s) => s.toggleDiagnostic);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const segmentCapability = useUiStore((s) => s.capabilities?.segments);
  const segmentsUnavailable = !config.demo && segmentCapability !== 'READY';
  return (
    <GlassSidebar id="side-panel" className={`side${drawerOpen ? ' side-open' : ''}`} data-tour="panel"
      role={compact && drawerOpen ? 'dialog' : undefined} aria-modal={compact && drawerOpen ? true : undefined} aria-labelledby="explorer-title">
      <header className="side-heading"><div><p className="eyebrow">Espace de supervision</p><h2 id="explorer-title">Explorer le réseau</h2></div>
        <SpatialButton type="button" className="icon-button drawer-close" aria-label="Fermer le panneau" onClick={() => { useUiStore.getState().setDrawerOpen(false); document.getElementById('drawer-toggle')?.focus(); }}><Icon name="close" /></SpatialButton>
      </header>
      <SearchBox stations={stations} onFocusStation={onFocus} onFocusAxis={onFocusAxis} />
      <div className="side-content">
      {compact && drawerOpen && <ActiveFilters stations={stations} />}
      <AxisSummary stations={stations} store={store} />
      <Section id="layers" title="Couches et gares">
        <fieldset className="control-group"><legend>Affichage sur la carte</legend>
        <label><input type="checkbox" checked={layers.stations} onChange={() => { toggleLayer('stations'); }} /> Activité des gares</label>
        <label><input type="checkbox" checked={layers.labels} onChange={() => { toggleLayer('labels'); }} /> Noms des gares</label>
        <label><input type="checkbox" checked={layers.axes} onChange={() => { toggleLayer('axes'); }} /> Noms des autoroutes</label>
        <label><input type="checkbox" checked={layers.od} onChange={() => { toggleLayer('od'); }} /> Flux origine → destination</label>
        <label><input type="checkbox" checked={layers.segments} disabled={segmentsUnavailable} aria-describedby={segmentsUnavailable ? 'segments-availability' : undefined} onChange={() => { toggleLayer('segments'); }} /> Charge des tronçons (estimée)</label>
        {segmentsUnavailable && <p id="segments-availability" className="note">{segmentCapability === 'DISABLED'
          ? 'Estimation indisponible : aucun graphe routier activé.'
          : segmentCapability === 'STARTING' ? 'Le premier calcul des tronçons est en cours.'
          : 'Disponibilité des tronçons non vérifiée. Nouvelle vérification automatique.'}</p>}
        </fieldset>
        <fieldset className="control-group"><legend>Types de gares</legend>
        <label><input type="checkbox" checked={kinds.has('ECHANGEUR')} onChange={() => { toggleKind('ECHANGEUR'); }} /> Gares d’échangeur</label>
        <label><input type="checkbox" checked={kinds.has('PLEINE_VOIE')} onChange={() => { toggleKind('PLEINE_VOIE'); }} /> Barrières pleine voie</label>
        </fieldset>
      </Section>
      <ActivityPanel stations={stations} store={store} onFocus={onFocus} />
      {layers.od && <OdPanel stations={stations} onFocusFlow={onFocusFlow} />}
      {layers.segments && <SegmentsPanel />}
      <Legend />
      </div>
      <details className="preferences"><summary><Icon name="settings" /> Préférences d’affichage<Icon name="chevron" className="preferences-chevron" /></summary><div className="preferences-body">
        <label><input type="checkbox" checked={palette === 'cvd'} onChange={(e) => { setPalette(e.target.checked ? 'cvd' : 'default'); }} /> Couleurs adaptées au daltonisme</label>
        <label><input type="checkbox" checked={reducedMotion} onChange={(e) => { setReducedMotion(e.target.checked); }} /> Réduire les animations</label>
      <Appearance /></div></details>
      <section className="side-actions" aria-label="Outils de la carte">
        <SpatialButton type="button" className="icon-button" onClick={() => { onResetView(); if (compact) { useUiStore.getState().setDrawerOpen(false); document.getElementById('drawer-toggle')?.focus(); } }}><Icon name="globe" />Vue France entière</SpatialButton>{' '}
        <SpatialButton id="diagnostic-toggle" type="button" className="icon-button" onClick={() => { toggleDiagnostic(); if (compact) useUiStore.getState().setDrawerOpen(false); }} aria-expanded={diagnosticOpen}><Icon name="activity" />Diagnostic</SpatialButton>
      </section>
    </GlassSidebar>
  );
}
