export type VisibilityExternalCalendarProviderType = "google" | "microsoft" | "apple_caldav" | "ics_read_only";

export type VisibilityExternalCalendar = {
  id: string;
  providerType: VisibilityExternalCalendarProviderType;
  providerAccountId: string | null;
  providerCalendarId: string | null;
  syncEnabled: boolean;
};

export type VisibilityExternalEventLink = {
  externalCalendarId: string;
  providerType: VisibilityExternalCalendarProviderType;
  providerCalendarId: string;
  calendarProviderAccountId: string | null;
  calendarProviderType: VisibilityExternalCalendarProviderType;
  calendarSyncEnabled: boolean;
};

export type VisibilityProductionEvent = {
  eventName: string;
  importedFrom: string | null;
  externalImportId: string | null;
  deletedAt: string | null;
  externalLinks: VisibilityExternalEventLink[];
};

export type LegacyExternalCalendarEvent = {
  externalCalendarId: string;
  calendarSyncEnabled: boolean;
};

export type ExternalCalendarVisibilityState = {
  enabledById: Map<string, boolean>;
  enabledByProviderKey: Map<string, boolean>;
};

function normalizeVisibilityLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeProviderCalendarKey(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    try {
      return new URL(trimmed, "https://caldav.icloud.com").pathname.replace(/\/+$/, "");
    } catch {
      return trimmed.replace(/\/+$/, "");
    }
  }
  return trimmed.replace(/\/+$/, "");
}

export function getExternalCalendarProviderKey(input: {
  providerType: VisibilityExternalCalendarProviderType | null | undefined;
  providerAccountId: string | null | undefined;
  providerCalendarId: string | null | undefined;
}) {
  if (!input.providerType || !input.providerAccountId || !input.providerCalendarId) return null;
  return `${input.providerType}:${input.providerAccountId}:${normalizeProviderCalendarKey(input.providerCalendarId)}`;
}

export function buildExternalCalendarVisibilityState(externalCalendars: VisibilityExternalCalendar[]): ExternalCalendarVisibilityState {
  const enabledById = new Map<string, boolean>();
  const enabledByProviderKey = new Map<string, boolean>();

  for (const calendar of externalCalendars) {
    enabledById.set(calendar.id, calendar.syncEnabled);

    const providerKey = getExternalCalendarProviderKey({
      providerType: calendar.providerType,
      providerAccountId: calendar.providerAccountId,
      providerCalendarId: calendar.providerCalendarId,
    });
    if (!providerKey) continue;

    enabledByProviderKey.set(providerKey, (enabledByProviderKey.get(providerKey) ?? true) && calendar.syncEnabled);
  }

  return { enabledById, enabledByProviderKey };
}

export function isExternalEventLinkVisible(link: VisibilityExternalEventLink, state: ExternalCalendarVisibilityState) {
  const exactEnabled = state.enabledById.get(link.externalCalendarId);
  const providerKey = getExternalCalendarProviderKey({
    providerType: link.calendarProviderType ?? link.providerType,
    providerAccountId: link.calendarProviderAccountId,
    providerCalendarId: link.providerCalendarId,
  });
  const providerEnabled = providerKey ? state.enabledByProviderKey.get(providerKey) : undefined;

  if (exactEnabled === false) return false;
  if (exactEnabled === true) return true;
  if (providerEnabled === false) return false;
  return providerEnabled ?? link.calendarSyncEnabled;
}

export function isLikelyOrphanExternalImportEvent(
  event: VisibilityProductionEvent,
  options: { nativeMstvIcsImportSource: string },
) {
  if (event.externalLinks.length > 0 || event.deletedAt) return false;
  if (event.importedFrom === options.nativeMstvIcsImportSource) return false;

  const normalizedEventName = normalizeVisibilityLabel(event.eventName);
  if (normalizedEventName === "evenement apple" || normalizedEventName === "evenement google") return true;

  const normalizedImportedFrom = normalizeVisibilityLabel(event.importedFrom ?? "");
  if (normalizedImportedFrom.includes("apple") || normalizedImportedFrom.includes("google")) return true;
  return Boolean(
    event.externalImportId &&
      normalizedImportedFrom &&
      normalizedImportedFrom !== normalizeVisibilityLabel(options.nativeMstvIcsImportSource),
  );
}

export function isProductionEventVisible(
  event: VisibilityProductionEvent,
  state: ExternalCalendarVisibilityState,
  options: { nativeMstvIcsImportSource: string },
) {
  if (event.deletedAt) return false;
  if (isLikelyOrphanExternalImportEvent(event, options)) return false;
  return event.externalLinks.every((link) => isExternalEventLinkVisible(link, state));
}

// Legacy ICS/Webcal read-only events still use external_calendar_events.
// Google/Apple/Microsoft provider sync should use events + external_event_links instead.
export function isLegacyExternalCalendarEventVisible(event: LegacyExternalCalendarEvent, state: ExternalCalendarVisibilityState) {
  return state.enabledById.get(event.externalCalendarId) ?? event.calendarSyncEnabled;
}
