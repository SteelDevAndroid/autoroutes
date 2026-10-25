/** État déclaré par la source, indépendant des compteurs de passages. */
export interface StationAnomaly {
  readonly type_ano: string;
  readonly cardinalite: number;
  readonly criticite: string;
}

const MAX_ITEMS = 100;
const MAX_TEXT = 256;
const nonEmptyText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT;

/** Un rapport invalide reste inconnu ; ne jamais transformer silencieusement un rapport invalide en []. */
export function parseAnomalies(value: unknown): readonly StationAnomaly[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const result: StationAnomaly[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const fields = item as Record<string, unknown>;
    if (!nonEmptyText(fields.type_ano) || !nonEmptyText(fields.criticite)
      || typeof fields.cardinalite !== 'number' || !Number.isInteger(fields.cardinalite)
      || fields.cardinalite < 0 || fields.cardinalite > 2_147_483_647) return null;
    result.push({ type_ano: fields.type_ano.trim(), cardinalite: fields.cardinalite, criticite: fields.criticite.trim() });
  }
  return result;
}

export const anomalySeverity = (criticality: string): number => {
  switch (criticality.trim().toLocaleLowerCase('fr')) {
    case 'faible': return 1;
    case 'moyenne': return 2;
    case 'haute': return 3;
    case 'critique': return 4;
    default: return 0;
  }
};

export function anomalySummary(anomalies: readonly StationAnomaly[] | null) {
  const active = (anomalies ?? []).filter((item) => item.cardinalite > 0);
  const severity = Math.max(0, ...active.map((item) => anomalySeverity(item.criticite)));
  return {
    count: active.reduce((total, item) => total + item.cardinalite, 0),
    severity,
    label: ['Non reconnue', 'Faible', 'Moyenne', 'Haute', 'Critique'][severity] ?? 'Non reconnue',
    unknown: active.some((item) => anomalySeverity(item.criticite) === 0),
  };
}
