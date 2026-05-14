export type CalendarMarkerType = "publicHoliday" | "schoolHoliday";

export type CalendarMarker = {
  label: string;
  type: CalendarMarkerType;
  date?: string;
  start?: string;
  end?: string;
};

export const publicHolidays: CalendarMarker[] = [
  { date: "2026-01-01", label: "Jour de l'an", type: "publicHoliday" },
  { date: "2026-04-06", label: "Lundi de Pâques", type: "publicHoliday" },
  { date: "2026-05-01", label: "Fête du travail", type: "publicHoliday" },
  { date: "2026-05-08", label: "Victoire 1945", type: "publicHoliday" },
  { date: "2026-05-14", label: "Ascension", type: "publicHoliday" },
  { date: "2026-05-25", label: "Lundi de Pentecôte", type: "publicHoliday" },
  { date: "2026-07-14", label: "Fête nationale", type: "publicHoliday" },
  { date: "2026-08-15", label: "Assomption", type: "publicHoliday" },
  { date: "2026-11-01", label: "Toussaint", type: "publicHoliday" },
  { date: "2026-11-11", label: "Armistice", type: "publicHoliday" },
  { date: "2026-12-25", label: "Noël", type: "publicHoliday" },
  { date: "2027-01-01", label: "Jour de l'an", type: "publicHoliday" },
  { date: "2027-03-29", label: "Lundi de Pâques", type: "publicHoliday" },
  { date: "2027-05-01", label: "Fête du travail", type: "publicHoliday" },
  { date: "2027-05-06", label: "Ascension", type: "publicHoliday" },
  { date: "2027-05-08", label: "Victoire 1945", type: "publicHoliday" },
  { date: "2027-05-17", label: "Lundi de Pentecôte", type: "publicHoliday" },
  { date: "2027-07-14", label: "Fête nationale", type: "publicHoliday" },
  { date: "2027-08-15", label: "Assomption", type: "publicHoliday" },
  { date: "2027-11-01", label: "Toussaint", type: "publicHoliday" },
  { date: "2027-11-11", label: "Armistice", type: "publicHoliday" },
  { date: "2027-12-25", label: "Noël", type: "publicHoliday" },
];

export const schoolHolidaysZoneC: CalendarMarker[] = [
  { start: "2026-01-01", end: "2026-01-04", label: "Vacances de Noël", type: "schoolHoliday" },
  { start: "2026-02-21", end: "2026-03-08", label: "Vacances d'hiver", type: "schoolHoliday" },
  { start: "2026-04-18", end: "2026-05-03", label: "Vacances de printemps", type: "schoolHoliday" },
  { start: "2026-05-14", end: "2026-05-17", label: "Pont de l'Ascension", type: "schoolHoliday" },
  { start: "2026-07-04", end: "2026-08-31", label: "Vacances d'été", type: "schoolHoliday" },
  { start: "2026-10-17", end: "2026-11-01", label: "Vacances de la Toussaint", type: "schoolHoliday" },
  { start: "2026-12-19", end: "2027-01-03", label: "Vacances de Noël", type: "schoolHoliday" },
  { start: "2027-02-06", end: "2027-02-21", label: "Vacances d'hiver", type: "schoolHoliday" },
  { start: "2027-04-03", end: "2027-04-18", label: "Vacances de printemps", type: "schoolHoliday" },
  { start: "2027-05-06", end: "2027-05-09", label: "Pont de l'Ascension", type: "schoolHoliday" },
  { start: "2027-07-03", end: "2027-08-31", label: "Vacances d'été", type: "schoolHoliday" },
];
