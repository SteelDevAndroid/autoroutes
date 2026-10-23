import type { AxisGroup } from '../map/axes';
import { useUiStore } from './uiStore';
import type { UiState } from './uiStore';
import { parseUrlState, serializeUrlState } from './urlState';
import type { UrlState } from './urlState';

export interface UrlSyncDeps {
  readonly stationIds: readonly string[];
  readonly axisGroups: readonly AxisGroup[];
  /** Cadre la carte sur la gare (null : aucune) ; sans effet tant que la carte n'est pas montée. */
  readonly showStation: (index: number | null) => void;
  readonly showAxis: (group: AxisGroup) => void;
}

const currentSearch = (): string => window.location.search.replace(/^\?/, '');

export function toUrlState(state: UiState, stationIds: readonly string[]): UrlState {
  return {
    stationId: state.selectedIndex === null ? null : stationIds[state.selectedIndex] ?? null,
    axis: state.odFilters.axis,
    od: state.layers.od,
    segments: state.layers.segments,
    level: state.odFilters.level,
    department: state.odFilters.department,
    role: state.odFilters.role,
  };
}

/**
 * Lien partageable : l'adresse reflète ce que l'on regarde (gare, autoroute, flux, tronçons) et la relire reproduit l'affichage.
 * Gare et autoroute ajoutent une entrée d'historique (le bouton « précédent » revient à l'état d'avant) ; les autres réglages remplacent l'entrée courante.
 * Retourne la fonction d'arrêt.
 */
export function startUrlSync(deps: UrlSyncDeps): () => void {
  const known = new Set(deps.stationIds);
  let applying = false;

  const apply = (wanted: UrlState) => {
    applying = true;
    try {
      const ui = useUiStore.getState();
      useUiStore.setState({ layers: { ...ui.layers, od: wanted.od, segments: wanted.segments } });
      ui.setOdFilters({ level: wanted.level, department: wanted.department, role: wanted.role, axis: '' });
      const group = wanted.axis === '' ? undefined : deps.axisGroups.find((g) => g.value === wanted.axis);
      if (group !== undefined) {
        useUiStore.getState().focusAxis(group.id, group.value);
        deps.showAxis(group);
      } else {
        useUiStore.getState().setOdFilters({ axis: wanted.axis });
        useUiStore.setState({ axisFocus: null });
      }
      const index = wanted.stationId === null ? null : deps.stationIds.indexOf(wanted.stationId);
      useUiStore.getState().select(index === null || index < 0 ? null : index);
      deps.showStation(index === null || index < 0 ? null : index);
    } finally {
      applying = false;
    }
  };

  apply(parseUrlState(window.location.search, known));
  // Adresse canonique : les paramètres invalides ou inutiles d'un vieux lien disparaissent.
  const canonical = (): string => serializeUrlState(toUrlState(useUiStore.getState(), deps.stationIds));
  const urlFor = (search: string): string => window.location.pathname + (search === '' ? '' : `?${search}`) + window.location.hash;
  if (canonical() !== currentSearch()) {
    window.history.replaceState(null, '', urlFor(canonical()));
  }

  const unsubscribe = useUiStore.subscribe((state, previous) => {
    if (applying) {
      return;
    }
    const next = serializeUrlState(toUrlState(state, deps.stationIds));
    if (next === currentSearch()) {
      return;
    }
    const navigated = state.selectedIndex !== previous.selectedIndex || state.odFilters.axis !== previous.odFilters.axis;
    window.history[navigated ? 'pushState' : 'replaceState'](null, '', urlFor(next));
  });
  const onPopState = () => { apply(parseUrlState(window.location.search, known)); };
  window.addEventListener('popstate', onPopState);
  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPopState);
  };
}
