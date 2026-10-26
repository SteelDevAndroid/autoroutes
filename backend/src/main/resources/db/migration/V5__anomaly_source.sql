-- Émetteur du rapport d'anomalies (champ « source ») : chaque source remplace son propre état. NULL = « peage » (anciennes lignes).
alter table quarantined_event add column anomaly_source text;
