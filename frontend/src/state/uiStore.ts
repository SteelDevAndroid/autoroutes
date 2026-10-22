import { create } from 'zustand';
import type { OdFilters, OdView } from '../od/odTypes';
import { DEFAULT_OD_FILTERS, EMPTY_OD_VIEW, streamOdView } from '../od/odTypes';
import type { FreshnessStatus, OdFlow } from '../realtime/protocol';
import type { ConnectionStatus } from '../realtime/streamClient';
import type { QualityLevel } from '../animation/frameLoop';
import type { StationKind } from '../map/referentiel';
import type { ReplayStatus } from '../replay/replaySession';

export interface LayerVisibility {
  readonly stations: boolean;
  readonly labels: boolean;
  readonly od: boolean;
  readonly segments: boolean;
}

export interface Freshness {
  readonly status: FreshnessStatus;
  readonly watermarkLagSeconds: number;
  readonly consumerLag: number;
  readonly staleStations: readonly string[];
}

export type Mode = 'live' | 'replay';

export interface ReplayState {
  readonly status: ReplayStatus;
  readonly speed: number;
  readonly time: string | null;
  readonly error: string | null;
}

export interface UiState {
  readonly selectedIndex: number | null;
  readonly layers: LayerVisibility;
  readonly kinds: ReadonlySet<StationKind>;
  readonly connection: ConnectionStatus;
  readonly freshness: Freshness | null;
  readonly watermark: string | null;
  readonly odView: OdView;
  readonly odFilters: OdFilters;
  /** « rest » : le serveur filtre (flux O/D lus par l'API) ; « stream » : flux SSE brut (démonstration). */
  readonly odSource: 'rest' | 'stream';
  readonly odError: string | null;
  readonly quality: QualityLevel;
  readonly reducedMotion: boolean;
  readonly diagnosticOpen: boolean;
  readonly resyncCount: number;
  readonly mode: Mode;
  readonly replay: ReplayState;
  readonly select: (index: number | null) => void;
  readonly toggleLayer: (layer: keyof LayerVisibility) => void;
  readonly toggleKind: (kind: StationKind) => void;
  readonly setConnection: (status: ConnectionStatus) => void;
  readonly setFreshness: (freshness: Freshness) => void;
  readonly setWatermark: (watermark: string | null) => void;
  readonly setOdFlows: (flows: readonly OdFlow[]) => void;
  readonly setOdView: (view: OdView) => void;
  readonly setOdFilters: (filters: Partial<OdFilters>) => void;
  readonly setOdSource: (source: 'rest' | 'stream') => void;
  readonly setOdError: (message: string | null) => void;
  readonly setQuality: (level: QualityLevel) => void;
  readonly setReducedMotion: (reduced: boolean) => void;
  readonly toggleDiagnostic: () => void;
  readonly countResync: () => void;
  readonly setMode: (mode: Mode) => void;
  readonly setReplay: (replay: Partial<ReplayState>) => void;
}

/** État d'interface uniquement (sélection, filtres, statuts) : les métriques des gares restent hors React, dans StationStore. */
export const useUiStore = create<UiState>()((set, get) => ({
  selectedIndex: null,
  layers: { stations: true, labels: true, od: false, segments: false },
  kinds: new Set<StationKind>(['ECHANGEUR', 'PLEINE_VOIE']),
  connection: 'connecting',
  freshness: null,
  watermark: null,
  odView: EMPTY_OD_VIEW,
  odFilters: DEFAULT_OD_FILTERS,
  odSource: 'stream',
  odError: null,
  quality: 0,
  reducedMotion: false,
  diagnosticOpen: false,
  resyncCount: 0,
  mode: 'live',
  replay: { status: 'paused', speed: 60, time: null, error: null },
  select: (selectedIndex) => { set({ selectedIndex }); },
  toggleLayer: (layer) => { set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })); },
  toggleKind: (kind) => {
    set((s) => {
      const kinds = new Set(s.kinds);
      if (kinds.has(kind)) {
        kinds.delete(kind);
      } else {
        kinds.add(kind);
      }
      return { kinds };
    });
  },
  setConnection: (connection) => { set({ connection }); },
  setFreshness: (freshness) => { set({ freshness }); },
  setWatermark: (watermark) => { set({ watermark }); },
  // Le flux SSE ne contient ni filtres ni couverture : il n'alimente la vue que sans lecture par l'API.
  setOdFlows: (flows) => { if (get().odSource === 'stream') set({ odView: streamOdView(flows) }); },
  setOdView: (odView) => { set({ odView, odError: null }); },
  setOdFilters: (filters) => { set((s) => ({ odFilters: { ...s.odFilters, ...filters } })); },
  setOdSource: (odSource) => { set({ odSource }); },
  setOdError: (odError) => { set({ odError }); },
  setQuality: (quality) => { set({ quality }); },
  setReducedMotion: (reducedMotion) => { set({ reducedMotion }); },
  toggleDiagnostic: () => { set((s) => ({ diagnosticOpen: !s.diagnosticOpen })); },
  countResync: () => { set((s) => ({ resyncCount: s.resyncCount + 1 })); },
  setMode: (mode) => { set({ mode }); },
  setReplay: (replay) => { set((s) => ({ replay: { ...s.replay, ...replay } })); },
}));
