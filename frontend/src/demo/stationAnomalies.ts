import type { StationAnomaly } from '../realtime/anomalies';

/** Exemple fourni pour la démonstration : uniquement des valeurs simulées. */
export const DEMO_ANOMALIES: readonly StationAnomaly[] = [
  { type_ano: 'Panne de lecteur de badge télépéage (setBadge)', cardinalite: 2, criticite: 'Moyenne' },
  { type_ano: 'Défaut d’imprimante de ticket (voie manuelle)', cardinalite: 1, criticite: 'Faible' },
  { type_ano: 'Barrière de péage bloquée en position ouverte', cardinalite: 1, criticite: 'Haute' },
  { type_ano: 'Erreur de communication avec le serveur central de paiement', cardinalite: 4, criticite: 'Critique' },
];
