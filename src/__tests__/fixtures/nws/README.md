# NWS and NOAA fixtures

Recorded 2026-11-27T13:58Z for the point 41.03,-73.76 (grid OKX/39,58, station KHPN), from
`api.weather.gov` and `mapservices.weather.noaa.gov`. US government data, public domain.

Trimmed, never edited: `hourly.json` keeps the first 30 periods; `grid.json` keeps 17 layers
and the first 40 entries of each; `stations.json` keeps the first three stations and three
fields; `radar-identify.json` keeps each catalog item's `idp_validtime` only.

Note what the live data really does: `observation.json` has no `precipitationLastHour` key
at all. Tests rely on that.
