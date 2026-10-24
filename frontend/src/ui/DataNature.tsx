import { config } from '../config';
import { useUiStore } from '../state/uiStore';

export function DataNature() {
  const provenance = useUiStore((s) => s.mode === 'replay' ? s.replayProvenance : s.capabilities?.provenance ?? 'UNKNOWN');
  const label = config.demo || provenance === 'SIMULATED' ? 'simulé'
    : provenance === 'OBSERVED' ? 'observé' : provenance === 'MIXED' ? 'mixte' : 'source non vérifiée';
  return <span className="tag section-tag">{label}</span>;
}
