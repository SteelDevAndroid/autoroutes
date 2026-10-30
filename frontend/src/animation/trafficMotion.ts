import type { UiState } from '../state/uiStore';

export type TrafficMotionState = 'live' | 'waiting' | 'disconnected' | 'catching-up' | 'stale' | 'od-error' | 'replay';

/** Les indicateurs du direct ne doivent pas qualifier les données historiques. */
export function trafficMotionState(state: Pick<UiState, 'mode' | 'connection' | 'freshness' | 'freshnessConfirmed' | 'odSource' | 'odError'>): TrafficMotionState {
  if (state.mode === 'replay') return 'replay';
  if (state.connection !== 'open') return state.connection === 'connecting' ? 'waiting' : 'disconnected';
  if (state.freshness === null || !state.freshnessConfirmed) return 'waiting';
  if (state.freshness.status === 'STALE') return 'stale';
  if (state.freshness.status === 'CATCHING_UP') return 'catching-up';
  if (state.odSource === 'rest' && state.odError !== null) return 'od-error';
  return 'live';
}

export const trafficMotionMessage: Record<TrafficMotionState, string | null> = {
  live: null,
  replay: null,
  waiting: 'Animation suspendue : fraîcheur des données en attente de confirmation.',
  disconnected: 'Animation suspendue : connexion interrompue. Dernières valeurs conservées.',
  'catching-up': 'Animation suspendue pendant le rattrapage des données.',
  stale: 'Animation suspendue : données périmées. Dernières valeurs conservées.',
  'od-error': 'Animation suspendue : les flux n’ont pas pu être actualisés.',
};
