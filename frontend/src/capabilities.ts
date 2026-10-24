export type Provenance = 'SIMULATED' | 'OBSERVED' | 'MIXED' | 'UNKNOWN';
export type SegmentCapability = 'DISABLED' | 'STARTING' | 'READY';

export interface Capabilities {
  readonly provenance: Provenance;
  readonly segments: SegmentCapability;
}

export async function loadCapabilities(signal: AbortSignal): Promise<Capabilities> {
  const response = await fetch('/api/v1/capabilities', { signal });
  if (!response.ok) throw new Error('Les capacités du serveur sont indisponibles.');
  const value = await response.json() as Partial<Capabilities>;
  if (!['SIMULATED', 'OBSERVED', 'MIXED', 'UNKNOWN'].includes(value.provenance ?? '')
    || !['DISABLED', 'STARTING', 'READY'].includes(value.segments ?? '')) {
    throw new Error('Réponse des capacités du serveur invalide.');
  }
  return value as Capabilities;
}
