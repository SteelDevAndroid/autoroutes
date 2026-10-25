-- Rapport autorisé de la gare, conservé pour le rejeu des événements en quarantaine.
-- NULL : état non communiqué ; [] : rapport explicite sans anomalie.
alter table quarantined_event add column anomalies jsonb;
alter table quarantined_event add constraint quarantined_anomalies_array
    check (anomalies is null or jsonb_typeof(anomalies) = 'array');
