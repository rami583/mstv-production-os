export type DisplayExternalCalendarProviderType = "google" | "microsoft" | "apple_caldav" | "ics_read_only";
export type DisplayExternalCalendarRole = "business_primary" | "external_context";
export type DisplayProductionEventRole = "production" | "external_context";

export type DisplayExternalEventLink = {
  providerType: DisplayExternalCalendarProviderType;
  calendarName: string;
  calendarColor: string | null;
  calendarSyncEnabled: boolean;
  calendarRole: DisplayExternalCalendarRole;
  rawExternalEvent: Record<string, unknown> | null;
};

export type DisplayProductionEvent = {
  clientName: string;
  eventName: string;
  importedFrom: string | null;
  eventRole: DisplayProductionEventRole;
  externalLinks: DisplayExternalEventLink[];
};

function normalizeDisplayLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isGoogleOrAppleImportedEvent(event: DisplayProductionEvent) {
  if (event.externalLinks.some((link) => link.providerType === "google" || link.providerType === "apple_caldav")) return true;

  const normalizedSource = normalizeDisplayLabel(event.importedFrom ?? "");
  return normalizedSource.includes("google") || normalizedSource.includes("apple");
}

export function isGenericExternalEventName(value: string) {
  const normalizedValue = normalizeDisplayLabel(value);
  return (
    normalizedValue === "evenement apple" ||
    normalizedValue === "evenement google" ||
    normalizedValue === "evenement importe" ||
    normalizedValue === "external event"
  );
}

export function getProductionEventDisplay(event: DisplayProductionEvent) {
  const rawTitle = event.clientName.trim() || event.eventName.trim();
  const subtitle = event.eventName.trim();

  if (!isGoogleOrAppleImportedEvent(event)) {
    return { title: rawTitle || "Événement", subtitle };
  }

  const title = rawTitle;
  if (!title && (!subtitle || isGenericExternalEventName(subtitle))) {
    return { title: "", subtitle: "" };
  }

  if (!subtitle || isGenericExternalEventName(subtitle) || normalizeDisplayLabel(subtitle) === normalizeDisplayLabel(title)) {
    return { title, subtitle: "" };
  }

  return { title, subtitle };
}

export function getProductionEventDisplayLine(event: DisplayProductionEvent) {
  const display = getProductionEventDisplay(event);
  return [display.title, display.subtitle].filter(Boolean).join(" - ");
}

export function getEffectiveProductionEventRole(event: DisplayProductionEvent): DisplayProductionEventRole {
  if (event.eventRole === "production") return "production";
  return "external_context";
}

export function isExternalContextProductionEvent(event: DisplayProductionEvent) {
  return getEffectiveProductionEventRole(event) === "external_context";
}

function getStringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getStringArrayFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => getStringFromUnknown(item))
    .filter((item): item is string => Boolean(item));
}

function getObjectFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getNestedObjectValue(source: Record<string, unknown> | null, path: string[]) {
  let current: unknown = source;
  for (const key of path) {
    const object = getObjectFromUnknown(current);
    if (!object) return null;
    current = object[key];
  }
  return current;
}

function getExternalEventUrlMatches(...values: Array<string | null | undefined>) {
  const urls = values.flatMap((value) => value?.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []);
  return Array.from(new Set(urls.map((url) => url.replace(/[.,;]+$/, ""))));
}

function getMeetingUrlPriority(url: string) {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes("teams.microsoft.com") || normalizedUrl.includes("teams.live.com")) return 0;
  if (normalizedUrl.includes("meet.google.com")) return 1;
  if (normalizedUrl.includes("zoom.us") || normalizedUrl.includes("zoom.com")) return 2;
  return 3;
}

function getBestMeetingUrl(urls: string[]) {
  return [...urls].sort((left, right) => getMeetingUrlPriority(left) - getMeetingUrlPriority(right))[0] ?? null;
}

function getExternalEventAttendees(raw: Record<string, unknown> | null) {
  if (!raw) return [];

  const googleAttendees = Array.isArray(raw.attendees)
    ? raw.attendees
        .map((attendee) => {
          const attendeeObject = getObjectFromUnknown(attendee);
          if (!attendeeObject) return null;
          return getStringFromUnknown(attendeeObject.displayName) ?? getStringFromUnknown(attendeeObject.email);
        })
        .filter((attendee): attendee is string => Boolean(attendee))
    : [];

  const appleAttendees = getStringArrayFromUnknown(raw.ATTENDEE);
  return Array.from(new Set([...googleAttendees, ...appleAttendees])).slice(0, 12);
}

export function getPrimaryExternalEventLink(event: DisplayProductionEvent) {
  return event.externalLinks.find((link) => link.calendarSyncEnabled) ?? event.externalLinks[0] ?? null;
}

export function getExternalContextDetails(event: DisplayProductionEvent) {
  const raw = event.externalLinks.find((link) => link.rawExternalEvent)?.rawExternalEvent ?? null;
  const description =
    getStringFromUnknown(raw?.description) ??
    getStringFromUnknown(raw?.DESCRIPTION) ??
    getStringFromUnknown(raw?.bodyPreview) ??
    getStringFromUnknown(raw?.notes) ??
    getStringFromUnknown(raw?.rawDescription);
  const locationValue = raw?.location ?? raw?.LOCATION;
  const location =
    getStringFromUnknown(locationValue) ??
    (locationValue && typeof locationValue === "object" ? getStringFromUnknown((locationValue as Record<string, unknown>).displayName) : null);
  const sourceName = getPrimaryExternalEventLink(event)?.calendarName ?? null;
  const conferenceEntryPoints = Array.isArray(getNestedObjectValue(raw, ["conferenceData", "entryPoints"]))
    ? (getNestedObjectValue(raw, ["conferenceData", "entryPoints"]) as unknown[])
        .map((entryPoint) => getStringFromUnknown(getObjectFromUnknown(entryPoint)?.uri))
        .filter((url): url is string => Boolean(url))
    : [];
  const meetingUrls = Array.from(
    new Set([
      ...conferenceEntryPoints,
      ...getExternalEventUrlMatches(
        location,
        description,
        getStringFromUnknown(raw?.hangoutLink),
        getStringFromUnknown(raw?.htmlLink),
        getStringFromUnknown(raw?.URL),
      ),
    ]),
  );
  const meetingUrl = getBestMeetingUrl(meetingUrls);
  const attendees = getExternalEventAttendees(raw);
  return { description, location, sourceName, meetingUrl, meetingUrls, attendees };
}

export function getEventCalendarBadge(event: DisplayProductionEvent) {
  const externalLink = getPrimaryExternalEventLink(event);
  if (externalLink) {
    return {
      name: externalLink.calendarName,
      color: externalLink.calendarColor,
    };
  }

  return {
    name: "Mon Studio TV",
    color: "rose",
  };
}
