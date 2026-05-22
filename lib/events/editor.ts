import { getEffectiveProductionEventRole } from "@/lib/events/display";

export type EventEditorFormInput = {
  clientName: string;
  eventName: string;
  date: string;
  isAllDay: boolean;
  clientArrivalTime: string;
  startTime: string;
  endTime: string;
  endOfDayTime: string;
  syncExternalCalendarId?: string | null;
  optionLabels?: string[];
  quoteReference?: string | null;
  quoteVersion?: string | null;
  sourceQuoteText?: string | null;
};

export type EventEditorExternalCalendarProviderType = "google" | "microsoft" | "apple_caldav" | "ics_read_only";
export type EventEditorExternalCalendarRole = "business_primary" | "external_context";

export type EventEditorExternalCalendar = {
  id: string;
  name: string;
  providerType: EventEditorExternalCalendarProviderType;
  calendarRole: EventEditorExternalCalendarRole;
};

export type EventEditorExternalLink = {
  externalCalendarId: string;
  providerType: EventEditorExternalCalendarProviderType;
  calendarSyncCapability: "read_only" | "bidirectional";
  calendarSyncEnabled: boolean;
  calendarRole: EventEditorExternalCalendarRole;
  calendarName: string;
  calendarColor: string | null;
  rawExternalEvent: Record<string, unknown> | null;
};

export type EventEditorEvent = {
  clientName: string;
  eventName: string;
  date: string;
  isAllDay: boolean;
  clientArrivalTime: string | null;
  startTime: string | null;
  endTime: string | null;
  endOfDayTime: string | null;
  importedFrom: string | null;
  eventRole: "production" | "external_context";
  externalLinks: EventEditorExternalLink[];
};

export function toTimeInputValue(time: string | null) {
  if (!time) return "";
  const [hours = "00", minutes = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

export function sanitizeTimeDraft(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function normalizeCompactTimeInput(value: string) {
  const digits = sanitizeTimeDraft(value);
  if (!digits) return "";

  const [hours, minutes] =
    digits.length <= 2
      ? [digits, "00"]
      : digits.length === 3
        ? [digits.slice(0, 1), digits.slice(1)]
        : [digits.slice(0, 2), digits.slice(2)];

  const hourNumber = Number(hours);
  const minuteNumber = Number(minutes);

  if (!Number.isInteger(hourNumber) || !Number.isInteger(minuteNumber)) return "";
  if (hourNumber < 0 || hourNumber > 23 || minuteNumber < 0 || minuteNumber > 59) return "";

  return `${String(hourNumber).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
}

export function normalizeEventTimeInput(input: EventEditorFormInput): EventEditorFormInput {
  if (input.isAllDay) {
    return {
      ...input,
      clientArrivalTime: "",
      startTime: "",
      endTime: "",
      endOfDayTime: "",
    };
  }

  return {
    ...input,
    clientArrivalTime: normalizeCompactTimeInput(input.clientArrivalTime),
    startTime: normalizeCompactTimeInput(input.startTime),
    endTime: normalizeCompactTimeInput(input.endTime),
    endOfDayTime: normalizeCompactTimeInput(input.endOfDayTime),
  };
}

export function getEventEditorWritableExternalLinks(event: EventEditorEvent) {
  return event.externalLinks.filter(
    (link) =>
      (link.providerType === "google" || link.providerType === "apple_caldav") &&
      link.calendarSyncCapability === "bidirectional",
  );
}

export function getCurrentEditorExternalCalendarId(event: EventEditorEvent | null) {
  const externalLinks = event ? getEventEditorWritableExternalLinks(event) : [];
  if (externalLinks.filter((link) => link.calendarSyncEnabled).length !== 1) return null;
  return externalLinks.find((link) => link.calendarSyncEnabled)?.externalCalendarId ?? null;
}

export function getEventEditorInitialForm(event: EventEditorEvent | null, selectedDateKey: string): EventEditorFormInput {
  return {
    clientName: event?.clientName ?? "",
    eventName: event?.eventName ?? "",
    date: event?.date ?? selectedDateKey,
    isAllDay: event?.isAllDay ?? false,
    clientArrivalTime: event ? toTimeInputValue(event.clientArrivalTime) : "08:30",
    startTime: event ? toTimeInputValue(event.startTime) : "10:00",
    endTime: event ? toTimeInputValue(event.endTime) : "11:30",
    endOfDayTime: event ? toTimeInputValue(event.endOfDayTime) : "13:00",
    syncExternalCalendarId: getCurrentEditorExternalCalendarId(event),
  };
}

export function getSelectableEditorSyncCalendars(input: {
  event: EventEditorEvent | null;
  syncCalendars: EventEditorExternalCalendar[];
  currentExternalCalendarId: string | null;
}) {
  const isEditing = Boolean(input.event);
  const externalLinks = input.event ? getEventEditorWritableExternalLinks(input.event) : [];
  const currentExternalLink = input.currentExternalCalendarId
    ? externalLinks.find((link) => link.externalCalendarId === input.currentExternalCalendarId) ?? null
    : null;

  if (isEditing && currentExternalLink?.providerType === "apple_caldav") {
    return input.syncCalendars.filter((calendar) => calendar.providerType === "apple_caldav");
  }

  if (isEditing && currentExternalLink?.providerType === "google") {
    return input.syncCalendars.filter((calendar) => calendar.id === input.currentExternalCalendarId);
  }

  return input.syncCalendars;
}

export function getEditorSelectedSyncCalendar(
  syncExternalCalendarId: string | null | undefined,
  selectableSyncCalendars: EventEditorExternalCalendar[],
) {
  return syncExternalCalendarId ? selectableSyncCalendars.find((calendar) => calendar.id === syncExternalCalendarId) ?? null : null;
}

export function shouldShowProductionEditorTimeFields(input: {
  event: EventEditorEvent | null;
  selectedSyncCalendar: EventEditorExternalCalendar | null;
}) {
  return input.event
    ? getEffectiveProductionEventRole(input.event) === "production"
    : input.selectedSyncCalendar?.calendarRole !== "external_context";
}

export function getNormalizedEventEditorForm(input: EventEditorFormInput, showProductionTimeFields: boolean) {
  return normalizeEventTimeInput(
    showProductionTimeFields
      ? input
      : {
          ...input,
          clientArrivalTime: "",
          endOfDayTime: "",
        },
  );
}

export function getEditorExternalCalendarProviderLabel(providerType: EventEditorExternalCalendarProviderType) {
  const labels: Record<EventEditorExternalCalendarProviderType, string> = {
    google: "Google",
    microsoft: "Outlook",
    apple_caldav: "Apple",
    ics_read_only: "ICS",
  };
  return labels[providerType];
}
