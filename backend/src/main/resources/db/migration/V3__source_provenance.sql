-- Source counters share the history/checkpoint transaction and the same retention.
-- Existing rows deliberately retain zero source counters: their provenance is UNKNOWN.
alter table station_minute add column simulated bigint not null default 0,
                           add column observed bigint not null default 0;
alter table station_quarter add column simulated bigint not null default 0,
                            add column observed bigint not null default 0;
alter table station_hour add column simulated bigint not null default 0,
                         add column observed bigint not null default 0;
