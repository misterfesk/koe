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

## 2026-10-26 addition: five English-first markets and emergency numbers

GB, IE, CA, AU and NZ were added because a reviewer found these English-first launch markets missing. This is a market-coverage addition, not a burden-threshold sample, and the WHO threshold above was not applied. Each line is the primary adult crisis or listening service, read on the service's own page on 2026-10-26. Channels and hours are recorded only as stated there. These are page checks, not test calls.

Owner expectations were confirmed: Samaritans 116 123 (GB), Lifeline 13 11 14 (AU), 9-8-8 (CA) and 1737 (NZ). For Ireland, Samaritans Ireland 116 123 was kept; no better-established national adult line was identified on an official source in this pass. For New Zealand, 1737 was chosen over Lifeline Aotearoa 0800 543 354 because the 1737 page states free, 24/7 call, text and chat support; the Lifeline number was not checked.

| Region | Line | Number | Source | Verbatim quote |
|---|---|---|---|---|
| GB | Samaritans | 116 123 | [samaritans.org](https://www.samaritans.org/how-we-can-help/contact-samaritan/) | "For urgent support please call 116 123." and "Call us free, day or night, 365 days a year". Same page: online chat "This service is not currently available"; "We've closed our email service in the UK". |
| IE | Samaritans Ireland | 116 123 | [samaritans.org/ireland](https://www.samaritans.org/ireland/samaritans-ireland/) | "Need support? Call 116 123 to speak to a Samaritan" and "Call us free, day or night, 365 days a year". No text or email channel was stated on the checked page. |
| CA | 9-8-8 Suicide Crisis Helpline | 9-8-8 | [988.ca](https://988.ca/) | "Call or Text 9-8-8" and "A safe space to talk, 24 hours a day, every day of the year." Corroborated by [Public Health Agency of Canada](https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html): "call or text 9-8-8. Support is available 24 hours a day, 7 days a week." Chat was not stated. |
| AU | Lifeline | 13 11 14 | [lifeline.org.au](https://www.lifeline.org.au/get-help/) | "You can chat to a Lifeline crisis supporter anytime by calling 13 11 14." "Message us on 0477 13 11 14. Available 24/7." "Our chat service, on the web, available 24/7." |
| NZ | 1737, Need to talk? | 1737 | [1737.org.nz](https://1737.org.nz/) | "Call or text 1737 for brief emotional support with trained counsellors and peer support workers." and "free, confidential 24/7 support for anyone in New Zealand". Chat: "text or chat with us at 1737 anytime." |

### Emergency numbers (all 15 regions)

New optional field `emergency` holds the number for immediate danger, from a government or official body page read 2026-10-26. Where a separate ambulance number exists, the medical-emergency number is shown and labelled. Quotes in Bengali are verbatim; the English gloss is ours.

| Region | Value | Source | Verbatim quote |
|---|---|---|---|
| US | 911 | [911.gov (NHTSA)](https://www.911.gov/) | "If you're experiencing an emergency, call 911 immediately." |
| GB | 999 or 112 | [GOV.UK](https://www.gov.uk/guidance/get-urgent-help-and-report-a-crime-homes-for-ukraine) | "999 is the number to call in an emergency." "112 ... can be used instead of 999 and will connect you to the same services." |
| IE | 112 or 999 | [HSE](https://www2.hse.ie/emergencies/when-to-call-112-or-999/) | "Always call 112 or 999 if someone is seriously ill or injured and their life is at risk." (also [gov.ie](https://www.gov.ie/en/department-of-the-taoiseach/services/how-to-contact-emergency-services-in-ireland/)) |
| CA | 911 | [Public Health Agency of Canada](https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html) | "If you're in immediate danger or need urgent medical support, call 9-1-1." |
| AU | 000 | [Dept of Infrastructure](https://www.infrastructure.gov.au/media-communications/phone/triple-zero) | "Call Triple Zero (000) in an emergency." 112 also works from mobiles only. |
| NZ | 111 | [NZ Police](https://www.police.govt.nz/call-111) | "Call One-One-one (111) when you need an emergency response from Police, Fire or Ambulance." |
| SG | 995 (ambulance) | [SCDF](https://www.scdf.gov.sg/home/about-scdf/emergency-medical-services) | "Call 995 only for Emergency" (SCDF Emergency Medical Services page). Police number not checked, so not listed. |
| JP | 119 (ambulance and fire) | [FDMA](https://www.fdma.go.jp/publication/portal/items/portal001_pamphiet_english.pdf) | "Please call 119 when you need an ambulance service" |
| KR | 119 | [Ministry of the Interior and Safety](https://www.mois.go.kr/eng/sub/a03/bestPractices3/screen.do) | "112 and 119 for emergencies". 112 is the police number per this page's pairing; fire and ambulance function of 119 was not stated on an official page I could read, so no label is shown. |
| BD | 999 | [bangladesh.gov.bd](https://www.bangladesh.gov.bd/site/page/aaebba14-f52a-4a3d-98fd-a3f8b911d3d9/%E0%A6%9C%E0%A6%B0%E0%A7%81%E0%A6%B0%E0%A6%BF-%E0%A6%B9%E0%A6%9F%E0%A6%B2%E0%A6%BE%E0%A6%87%E0%A6%A8) | "এটি দেশের জাতীয় জরুরি সেবা নম্বর।" (gloss: this is the country's national emergency service number, for 999) |
| IN | 112 | [112.gov.in (Govt of India)](https://www.112.gov.in/) | "Emergency Response Support System (ERSS) is a Pan-India single number (112) based emergency response system" |
| LK | 1990 (ambulance) | [1990 Suwa Seriya Foundation](https://www.1990.lk/) | "1990 Suwa Seriya provides island-wide, free pre-hospital emergency care to all Sri Lankans" (foundation established by Act of Parliament 2018). The page FAQ says to dial 1990 toll free. |
| LT | 112 | [112.lt (Emergency Response Centre)](https://112.lt/en/about-number-112/) | "112 is a single contact number ... for calling the emergency services – police, fire and rescue service and ambulance. It is free and is available 24/7." |
| ZA | 10177 (ambulance) or 112 from a mobile phone | [Western Cape Government](https://www.westerncape.gov.za/health-wellness/know-who-you-can-call-emergency) | "there's no single emergency number in South Africa"; lists "Ambulance 10177" and "Cell Phone Emergency 112". Police is 10111 (not shown in app). This is a provincial government page; no national page was found. |
| PL | 112 | [gov.pl](https://www.gov.pl/web/numer-alarmowy-112/jak-zglaszac) | "Numer alarmowy 112 wybieraj w sytuacjach alarmowych, w których niezbędna jest pomoc Policji, Państwowej Straży Pożarnej lub Państwowego Ratownictwa Medycznego" |

Differences from the brief: Japan's 119, South Korea's 119, Bangladesh's 999, India's 112, Lithuania's 112, Poland's 112, Singapore's 995 and Sri Lanka's 1990 matched. South Africa uses 10177 for ambulance on the official page we found. Ireland's gov.ie page headings list 112 and 999 separately; the HSE page states both. Not verified from an official source: Singapore police 999 and Japan/Korea/Sri Lanka/India police numbers (not shown). Hours of the emergency services were not recorded. Numbers can differ for mobiles, roaming or landlines; the app's "Check locally before relying on this." applies.
