import { useMemo } from 'react';
import { buildAxisGroups } from '../map/axes';
import type { StationCollection } from '../map/referentiel';
import { useUiStore } from '../state/uiStore';
import { METRIC_LABELS } from './MetricStations';
import { Icon } from './Icon';

/** Chaque puce indique sa portée ; la liste d'un indicateur ne filtre pas la carte. */
export function ActiveFilters({ stations }: { readonly stations: StationCollection }) {
  const kinds = useUiStore((s) => s.kinds);
  const filters = useUiStore((s) => s.odFilters);
  const od = useUiStore((s) => s.layers.od);
  const source = useUiStore((s) => s.odSource);
  const metric = useUiStore((s) => s.activityMetric);
  const includeInternal = useUiStore((s) => s.odIncludeInternal);
  const axes = useMemo(() => buildAxisGroups(stations), [stations]);
  const chips: { key: string; label: string; remove: () => void }[] = [];
  const ui = useUiStore.getState;
  if (!kinds.has('ECHANGEUR')) chips.push({ key: 'echangeur', label: 'Carte · échangeurs masqués', remove: () => { ui().toggleKind('ECHANGEUR'); } });
  if (!kinds.has('PLEINE_VOIE')) chips.push({ key: 'pleine-voie', label: 'Carte · barrières masquées', remove: () => { ui().toggleKind('PLEINE_VOIE'); } });
  if (filters.axis !== '') chips.push({ key: 'axis', label: `Axe · ${axes.find((axis) => axis.value === filters.axis)?.id ?? filters.axis}`, remove: () => {
    if (ui().axisFocus?.value === filters.axis) ui().clearAxisFocus();
    else ui().setOdFilters({ axis: '' });
  } });
  if (od && source === 'rest') {
    if (filters.level === 'DEPARTMENT') chips.push({ key: 'level', label: 'Flux · par département', remove: () => { ui().setOdFilters({ level: 'STATION' }); } });
    if (filters.department !== '') chips.push({ key: 'department', label: `Flux · département ${filters.department}`, remove: () => { ui().setOdFilters({ department: '' }); } });
    if (filters.role !== 'ANY') chips.push({ key: 'role', label: `Flux · ${filters.role === 'ORIGIN' ? 'origine' : 'destination'}`, remove: () => { ui().setOdFilters({ role: 'ANY' }); } });
  }
  if (od && source === 'rest' && filters.level === 'DEPARTMENT' && includeInternal) chips.push({ key: 'internal', label: 'Flux · internes inclus', remove: () => { ui().setOdIncludeInternal(false); } });
  if (metric !== 'passages1h') chips.push({ key: 'metric', label: `Liste · ${METRIC_LABELS[metric]}`, remove: () => { ui().setActivityMetric('passages1h'); } });
  if (chips.length === 0) return null;
  return <section className="active-filters" aria-label="Filtres et vue actifs">
    <div className="filter-toolbar-heading"><p className="eyebrow">Périmètre affiché · {chips.length} filtre{chips.length > 1 ? 's' : ''}</p><button type="button" className="icon-button" onClick={() => { chips.forEach((chip) => { chip.remove(); }); document.getElementById(ui().drawerOpen || !window.matchMedia('(max-width: 900px)').matches ? 'station-search' : 'drawer-toggle')?.focus(); }}>Réinitialiser les filtres actifs</button></div>
    <ul>{chips.map((chip) => <li key={chip.key}><button type="button" className="filter-chip" aria-label={`Retirer : ${chip.label}`} onClick={() => {
      chip.remove();
      document.getElementById(!ui().drawerOpen && window.matchMedia('(max-width: 900px)').matches ? 'drawer-toggle' : 'station-search')?.focus();
    }}><span>{chip.label}</span><Icon name="close" /></button></li>)}</ul>
  </section>;
}
