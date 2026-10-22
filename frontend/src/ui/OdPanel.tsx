import { useMemo } from 'react';
import { config } from '../config';
import type { StationCollection } from '../map/referentiel';
import type { OdLevel, OdRole } from '../od/odTypes';
import { useUiStore } from '../state/uiStore';
import { formatCount } from './format';

const LEVELS: readonly { readonly value: OdLevel; readonly label: string }[] = [
  { value: 'STATION', label: 'Gares' },
  { value: 'DEPARTMENT', label: 'Départements' },
];

const ROLES: readonly { readonly value: OdRole; readonly label: string }[] = [
  { value: 'ANY', label: 'Origine ou destination' },
  { value: 'ORIGIN', label: 'Origine' },
  { value: 'DESTINATION', label: 'Destination' },
];

const TOP = 10;

/** Valeurs distinctes triées : départements et axes proposés par le référentiel chargé. */
export function filterOptions(stations: StationCollection): { departments: string[]; axes: string[] } {
  const departments = new Set<string>();
  const axes = new Set<string>();
  for (const { properties } of stations.features) {
    if (properties.dept !== '') departments.add(properties.dept);
    properties.axes.split(',').map((a) => a.trim()).filter((a) => a !== '').forEach((a) => axes.add(a));
  }
  return { departments: [...departments].sort(), axes: [...axes].sort() };
}

export function OdPanel({ stations }: { readonly stations: StationCollection }) {
  const view = useUiStore((s) => s.odView);
  const filters = useUiStore((s) => s.odFilters);
  const setFilters = useUiStore((s) => s.setOdFilters);
  const error = useUiStore((s) => s.odError);
  const mode = useUiStore((s) => s.mode);
  const options = useMemo(() => filterOptions(stations), [stations]);
  const names = useMemo(() => {
    const map = new Map(stations.features.map((f) => [f.properties.id, f.properties.name]));
    view.nodes.forEach((n) => { map.set(n.id, n.name); });
    return map;
  }, [stations, view.nodes]);
  const label = (id: string) => names.get(id) ?? id;
  const filtered = !config.demo;

  return (
    <section aria-label="Panneau des flux O/D">
      <h2>Flux O/D</h2>
      {filtered && (
        <div className="od-filters">
          <label>Niveau
            <select aria-label="Niveau des flux" value={filters.level} onChange={(e) => { setFilters({ level: e.target.value as OdLevel }); }}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label>Département
            <select aria-label="Département" value={filters.department} onChange={(e) => { setFilters({ department: e.target.value }); }}>
              <option value="">Tous</option>
              {options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>Axe
            <select aria-label="Axe" value={filters.axis} onChange={(e) => { setFilters({ axis: e.target.value }); }}>
              <option value="">Tous</option>
              {options.axes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>Le filtre porte sur
            <select aria-label="Côté du filtre" value={filters.role} onChange={(e) => { setFilters({ role: e.target.value as OdRole }); }}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {error !== null && <p className="note" role="alert">Flux O/D indisponibles : {error}</p>}
      {view.flows.length === 0
        ? <p className="note">Aucun flux d’au moins 3 véhicules sur l’heure pour ces critères.</p>
        : (
          <ol className="od-top" aria-label="Principaux flux">
            {view.flows.slice(0, TOP).map((f) => (
              <li key={`${f.originId}>${f.destinationId}`}>
                {f.originId === f.destinationId ? `${label(f.originId)} (interne)` : `${label(f.originId)} → ${label(f.destinationId)}`} <strong>{formatCount(f.vehicles)}</strong> véh. <span className="tag">observé</span>
              </li>
            ))}
          </ol>
        )}
      {view.maskedFlows > 0 && (
        <p className="note" data-testid="od-masked">
          {formatCount(view.maskedFlows)} flux de moins de 3 véhicules non affichés ({formatCount(view.maskedVehicles)} véh.), protection des données personnelles.
        </p>
      )}
      {view.truncated && <p className="note">Liste tronquée aux flux les plus importants.</p>}
      {mode === 'replay' && <p className="note">Relecture : flux de l’heure écoulée, mêmes filtres.</p>}
    </section>
  );
}
