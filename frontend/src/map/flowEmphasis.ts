import type { FlowKey } from '../state/uiStore';

/** La gare choisie prime sur l'axe ; le survol d'un flux prime sur les deux. */
export function flowEmphasis(key: FlowKey, highlighted: FlowKey | null, selected: string | null, axisStations: ReadonlySet<string>, stationLevel: boolean) {
  const active = highlighted !== null && key.originId === highlighted.originId && key.destinationId === highlighted.destinationId;
  const hasContext = stationLevel && (selected !== null || axisStations.size > 0);
  const context = stationLevel && (selected !== null ? key.originId === selected || key.destinationId === selected
    : axisStations.has(key.originId) || axisStations.has(key.destinationId));
  return { active, context, dim: highlighted !== null ? !active : hasContext && !context };
}
