import type { OdLevel, OdRole } from '../od/odTypes';

/**
 * Ce qui se partage par lien : la gare ouverte, l'autoroute filtrée, les couches des flux et des tronçons, le niveau et le côté des flux.
 * Tout le reste (relecture, sections ouvertes, vue de la carte) reste personnel : un lien reproduit « ce que je regarde », pas ma session.
 */
export interface UrlState {
  readonly stationId: string | null;
  /** Valeur du filtre « Axe » (codes séparés par des virgules). */
  readonly axis: string;
  readonly od: boolean;
  readonly segments: boolean;
  readonly level: OdLevel;
  readonly department: string;
  readonly role: OdRole;
}

export const EMPTY_URL_STATE: UrlState = { stationId: null, axis: '', od: false, segments: false, level: 'STATION', department: '', role: 'ANY' };

const AXIS = /^[A-Z0-9]{1,8}(,[A-Z0-9]{1,8}){0,11}$/;
const DEPARTMENT = /^(\d{2,3}|2[AB])$/;
const LEVELS: readonly OdLevel[] = ['STATION', 'DEPARTMENT'];
const ROLES: readonly OdRole[] = ['ANY', 'ORIGIN', 'DESTINATION'];

/**
 * Lecture tolérante : un paramètre inconnu, mal formé ou référençant une gare absente du référentiel est ignoré,
 * jamais une erreur (un vieux lien doit toujours ouvrir l'application).
 */
export function parseUrlState(search: string, knownStationIds: ReadonlySet<string>): UrlState {
  const params = new URLSearchParams(search);
  const station = params.get('gare') ?? '';
  const axis = (params.get('axe') ?? '').toUpperCase();
  const level = (params.get('niveau') ?? '').toUpperCase();
  const role = (params.get('role') ?? '').toUpperCase();
  const department = (params.get('dept') ?? '').toUpperCase();
  return {
    stationId: knownStationIds.has(station) ? station : null,
    axis: AXIS.test(axis) ? axis : '',
    od: params.get('flux') === '1' || AXIS.test(axis),
    segments: params.get('troncons') === '1',
    level: LEVELS.find((l) => l === level) ?? 'STATION',
    department: DEPARTMENT.test(department) ? department : '',
    role: ROLES.find((r) => r === role) ?? 'ANY',
  };
}

/** Chaîne de requête canonique (sans « ? ») : ne porte que ce qui diffère de l'affichage par défaut, dans un ordre fixe. */
export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.stationId !== null) params.set('gare', state.stationId);
  if (state.axis !== '') params.set('axe', state.axis);
  // Un filtre d'axe implique les flux : inutile de le répéter.
  if (state.od && state.axis === '') params.set('flux', '1');
  if (state.segments) params.set('troncons', '1');
  if (state.level !== 'STATION') params.set('niveau', state.level);
  if (state.department !== '') params.set('dept', state.department);
  if (state.role !== 'ANY') params.set('role', state.role);
  return params.toString();
}
