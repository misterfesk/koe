export type HelpResource = {
  region: string;
  country: string;
  name: string;
  localName?: string;
  phone: string;
  channels: string;
  hours?: string;
  sourceUrl: string;
  retrievedAt: string;
  note?: string;
};
export const helpResources: HelpResource[] = [
  {
    region: "US",
    country: "United States",
    name: "988 Suicide & Crisis Lifeline",
    phone: "988",
    channels: "Call or text",
    hours: "24/7",
    sourceUrl: "https://988lifeline.org/get-help/",
    retrievedAt: "2026-10-25",
  },
  {
    region: "SG",
    country: "Singapore",
    name: "Samaritans of Singapore",
    phone: "1767",
    channels: "Call",
    hours: "24/7",
    sourceUrl: "https://www.sos.org.sg/our-services/",
    retrievedAt: "2026-10-25",
  },
  {
    region: "JP",
    country: "Japan",
    name: "Unified Mental Health Consultation Dial",
    localName: "こころの健康相談統一ダイヤル",
    phone: "0570-064-556",
    channels: "Call",
    hours: "Hours vary by prefecture or designated city",
    sourceUrl:
      "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/jisatsu/soudan_tel.html",
    retrievedAt: "2026-10-25",
    note: "Calls beginning with 050 and LINE Out cannot connect. Consult the ministry's local contact list.",
  },
  {
    region: "KR",
    country: "South Korea",
    name: "Suicide Prevention Counseling Line",
    localName: "자살예방상담전화",
    phone: "109",
    channels: "Call",
    hours: "24 hours",
    sourceUrl: "https://www.129.go.kr/109",
    retrievedAt: "2026-10-25",
  },
  {
    region: "BD",
    country: "Bangladesh",
    name: "Kaan Pete Roi",
    phone: "+880 9612-119911",
    channels: "Call",
    hours: "Every day, 3:00 PM to 3:00 AM local time",
    sourceUrl: "https://kaanpeteroi.org/helpline-service/",
    retrievedAt: "2026-10-25",
  },
  {
    region: "IN",
    country: "India",
    name: "Tele-MANAS",
    localName: "टेली-मानस",
    phone: "14416",
    channels: "Call",
    hours: "24/7",
    sourceUrl:
      "https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2321522&lang=1&reg=3",
    retrievedAt: "2026-10-25",
  },
  {
    region: "LK",
    country: "Sri Lanka",
    name: "National Mental Health Helpline",
    phone: "1926",
    channels: "Call",
    sourceUrl: "https://www.nimh.health.gov.lk/",
    retrievedAt: "2026-10-25",
    note: "Hours were not stated on the checked page.",
  },
  {
    region: "LT",
    country: "Lithuania",
    name: "Hope Line",
    localName: "Vilties linija",
    phone: "116 123",
    channels: "Call",
    hours: "24/7",
    sourceUrl: "https://www.kpsc.lt/vilties-linija/",
    retrievedAt: "2026-10-25",
    note: "Available only from Lithuanian telecommunications networks.",
  },
  {
    region: "ZA",
    country: "South Africa",
    name: "SADAG Suicide Crisis Helpline",
    phone: "0800 567 567",
    channels: "Call",
    hours: "24 hours",
    sourceUrl: "https://www.sadag.org/",
    retrievedAt: "2026-10-25",
  },
  {
    region: "PL",
    country: "Poland",
    name: "Adult Emotional Crisis Telephone Support",
    localName: "Poradnia Telefoniczna dla Osób w Kryzysie Emocjonalnym",
    phone: "116 123",
    channels: "Call",
    hours: "24/7",
    sourceUrl: "https://116sos.pl/",
    retrievedAt: "2026-10-25",
  },
];
export const regionOptions = [
  ...helpResources.map((r) => ({ value: r.region, label: r.country })),
  { value: "OTHER", label: "Another country / region" },
];
