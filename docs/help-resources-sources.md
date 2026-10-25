# Help-resource content check

Research and independent fact-check completed separately on 2026-10-25. Both runs' model routing is unknown. These checks confirm published details, not test calls, capacity, connection, quality or clinical validation. App copy: "Last checked 2026-10-25" and "Check locally before relying on this."

The ten contact sources and exact published numbers are retained in [help-resources.ts](../fixtures/help-resources.ts). Researcher and fact-checker independently opened every service source. All ten were confirmed after correcting India's source URL to the English government release; the proposed Hindi iframe was unreachable. Japan's variable hours/050 restriction, Lithuania's network limitation, Bangladesh's limited hours and Sri Lanka's unstated hours remain visible. No guessed translations or hours.

## Region selection

US, SG, JP, KR and BD were owner-requested. Additional regions are a purposeful review-content sample: an accessible WHO 2019 total-population suicide mortality estimate above 10 per 100,000 plus a verifiable adult support service. The threshold is an implementation assumption, not a WHO classification, ranking or launch-market choice. Historical estimates are not current rates and are not displayed as burden scores in the app.

Independent fact-check read WHO country pages and their linked public RELAY_WHS data, filtering 2019, DIM_SEX=TOTAL, DIM_AGE=TOTAL. Confirmed estimates:

| Country | WHO 2019 estimate per 100,000 | Source |
|---|---:|---|
| India | 13.97581358 | [WHO India](https://data.who.int/countries/356) |
| Sri Lanka | 15.94353062 | [WHO Sri Lanka](https://data.who.int/countries/144) |
| Lithuania | 26.32801861 | [WHO Lithuania](https://data.who.int/countries/440) |
| South Africa | 20.14031320 | [WHO South Africa](https://data.who.int/countries/710) |
| Poland | 13.70162866 | [WHO Poland](https://data.who.int/countries/616) |

Estimates carry uncertainty and country data-quality limitations; these values do not support precise cross-country comparisons. [WHO indicator definition](https://www.who.int/data/gho/data/indicators/indicator-details/gho/crude-suicide-rates-%28per-100-000-population%29). The researcher's newer WHO report PDF returned 403; no claim is made to have read its tables.

## Supplemental name provenance

India's official Hindi title: [government National Task Force resources](https://ntf.education.gov.in/student-support-resources/). Poland's official local title: [government listing](https://www.gov.pl/web/baza-wiedzy/dwie-linie-pomocy-jeden-cel-rusza-ogolnopolska-kampania-ministerstwa-cyfryzacji-promujaca-numery-telefonu-116-111-i-116-123). Bengali/Sinhala/Tamil names were not verified and are omitted.

## Maintenance boundary

Resources are bundled locally so provider-offline mode does not hide Help. External service pages open only when the reviewer chooses a source link. No call/text URI launches automatically. A later real-user release requires a maintained resource process and local qualified review. This private build is not that release.
