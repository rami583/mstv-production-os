import type { Database } from "@/lib/supabase";
import {
  appleCorsHeaders,
  appleJsonResponse,
  decryptAppleCredentials,
  getBasicAuthHeader,
  getOwnedAppleAccount,
  getServiceSupabaseClient,
  joinCalDavUrl,
  requireAuthenticatedUser,
} from "../_shared";

export const runtime = "nodejs";

type ProductionEventRow = Database["public"]["Tables"]["events"]["Row"];
type ExternalCalendarRow = Database["public"]["Tables"]["external_calendars"]["Row"];
type ExternalEventLinkRow = Database["public"]["Tables"]["external_event_links"]["Row"];
type ExternalEventLinkInsert = Database["public"]["Tables"]["external_event_links"]["Insert"];
type AppleMoveErrorDetails = {
  stage: string;
  message: string;
  status?: number;
  statusText?: string | null;
  details?: string | null;
  providerResponse?: string | null;
  oldHrefExists?: boolean;
  targetCalendarId?: string | null;
  oldExternalCalendarId?: string | null;
  linkId?: string | null;
  newPutStatus?: number | null;
  oldDeleteStatus?: number | null;
  targetCalendarUrl?: string | null;
  generatedEventHref?: string | null;
  generatedUid?: string | null;
  contentType?: string | null;
  targetCalendarUrlEndsWithSlash?: boolean | null;
  finalPutUrl?: string | null;
};

class AppleProviderRequestError extends Error {
  status: number;
  statusText: string;
  providerResponse: string | null;
  requestHref: string;
  contentType: string | null;

  constructor(input: {
    message: string;
    status: number;
    statusText: string;
    providerResponse: string | null;
    requestHref: string;
    contentType: string | null;
  }) {
    super(input.message);
    this.status = input.status;
    this.statusText = input.statusText;
    this.providerResponse = input.providerResponse;
    this.requestHref = input.requestHref;
    this.contentType = input.contentType;
    this.name = "AppleProviderRequestError";
  }
}

class AppleMoveRouteError extends Error {
  details: AppleMoveErrorDetails;

  constructor(details: AppleMoveErrorDetails) {
    super(details.message);
    this.name = "AppleMoveRouteError";
    this.details = details;
  }
}

function getProviderErrorDetails(error: unknown) {
  if (error instanceof AppleProviderRequestError) {
    return {
      status: error.status,
      statusText: error.statusText,
      providerResponse: error.providerResponse,
      requestHref: error.requestHref,
      contentType: error.contentType,
    };
  }

  return {
    status: undefined,
    statusText: null,
    providerResponse: null,
    requestHref: null,
    contentType: null,
  };
}

function getSafeErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : null;
  }

  const parts: string[] = [];
  const record = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  if (typeof record.code === "string") parts.push(`code: ${record.code}`);
  if (typeof record.message === "string") parts.push(`message: ${record.message}`);
  if (typeof record.details === "string") parts.push(`details: ${record.details}`);
  if (typeof record.hint === "string") parts.push(`hint: ${record.hint}`);
  return parts.length > 0 ? parts.join(" | ") : null;
}

function makeAppleMoveError(stage: string, message: string, context: Omit<AppleMoveErrorDetails, "stage" | "message"> = {}) {
  return new AppleMoveRouteError({
    stage,
    message,
    ...context,
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: appleCorsHeaders,
  });
}

function addOneHour(time: string | null) {
  if (!time) return "10:00";
  const [hours = "09", minutes = "00"] = time.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(minutes));
  date.setHours(date.getHours() + 1);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toIcsDate(value: string) {
  return value.replace(/-/g, "");
}

function toIcsLocalDateTime(date: string, time: string) {
  const [hours = "09", minutes = "00", seconds = "00"] = time.split(":");
  return `${toIcsDate(date)}T${hours.padStart(2, "0")}${minutes.padStart(2, "0")}${seconds.padStart(2, "0")}`;
}

function toUtcIcsDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .trim();
}

function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function getAppleUid(event: ProductionEventRow, existingLink?: ExternalEventLinkRow | null) {
  return existingLink?.external_event_uid || existingLink?.external_event_id || `mstv-${event.id}@mstv-production-os`;
}

function getAppleMoveTargetUid(event: ProductionEventRow, targetCalendar: ExternalCalendarRow) {
  return `mstv-${event.id}-${targetCalendar.id}@mstv-production-os`;
}

function getAppleCalendarUrl(credentialsServerUrl: string, calendar: ExternalCalendarRow) {
  if (!calendar.provider_calendar_id) {
    throw new Error("Calendrier Apple incomplet.");
  }

  return joinCalDavUrl(credentialsServerUrl, calendar.provider_calendar_id);
}

function getAppleEventHrefFromCalendarUrl(calendarUrl: string, uid: string) {
  const collectionUrl = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
  const safeFileName = `${encodeURIComponent(uid).replace(/%40/gi, "@")}.ics`;
  return new URL(safeFileName, collectionUrl).toString();
}

function getAppleHref(input: { credentialsServerUrl: string; calendar: ExternalCalendarRow; uid: string; link?: ExternalEventLinkRow | null }) {
  const rawHref = input.link?.raw_external_event && typeof input.link.raw_external_event === "object"
    ? (input.link.raw_external_event as { href?: unknown }).href
    : null;
  if (typeof rawHref === "string" && rawHref.trim()) {
    return joinCalDavUrl(input.credentialsServerUrl, rawHref);
  }

  return getAppleEventHrefFromCalendarUrl(getAppleCalendarUrl(input.credentialsServerUrl, input.calendar), input.uid);
}

function getAppleEventPayload(event: ProductionEventRow, uid: string) {
  const summary = [event.client_name, event.event_name].filter(Boolean).join(" - ") || "Événement";
  const description = "Synchronisé depuis MSTV Production OS.";
  const dtstamp = toUtcIcsDateTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MSTV Production OS//Calendar Sync//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
  ];

  const hasTimedRange = Boolean(event.start_time || event.end_time);
  if (!hasTimedRange) {
    const nextDate = new Date(`${event.date}T12:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(nextDate.toISOString().slice(0, 10))}`);
  } else {
    const startTime = event.start_time ?? event.client_arrival_time ?? "09:00";
    const endTime = event.end_time ?? addOneHour(startTime);
    lines.push(`DTSTART;TZID=Europe/Paris:${toIcsLocalDateTime(event.date, startTime)}`);
    lines.push(`DTEND;TZID=Europe/Paris:${toIcsLocalDateTime(event.date, endTime)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

async function getOwnedAppleCalendar(supabase: ReturnType<typeof getServiceSupabaseClient>, calendarId: string, userId: string) {
  const { data: calendar, error } = await supabase
    .from("external_calendars")
    .select("*")
    .eq("id", calendarId)
    .eq("created_by_profile_id", userId)
    .eq("provider_type", "apple_caldav")
    .maybeSingle();

  if (error) throw error;
  if (!calendar?.provider_account_id || !calendar.provider_calendar_id || !calendar.sync_enabled) {
    throw new Error("Calendrier Apple introuvable ou désactivé.");
  }
  return calendar;
}

async function getEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, eventId: string) {
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw error;
  if (!event) throw new Error("Événement introuvable.");
  return event;
}

async function getAppleLinks(supabase: ReturnType<typeof getServiceSupabaseClient>, eventId: string, userId: string) {
  const { data: links, error } = await supabase
    .from("external_event_links")
    .select("*")
    .eq("event_id", eventId)
    .eq("provider_type", "apple_caldav")
    .is("deleted_locally_at", null);

  if (error) throw error;
  const ownedLinks: Array<{ link: ExternalEventLinkRow; calendar: ExternalCalendarRow }> = [];

  for (const link of links ?? []) {
    const calendar = await getOwnedAppleCalendar(supabase, link.external_calendar_id, userId);
    ownedLinks.push({ link, calendar });
  }

  return ownedLinks;
}

async function getAppleCredentialsForCalendar(supabase: ReturnType<typeof getServiceSupabaseClient>, calendar: ExternalCalendarRow, userId: string) {
  if (!calendar.provider_account_id || !calendar.provider_calendar_id) {
    throw new Error("Calendrier Apple incomplet.");
  }
  const account = await getOwnedAppleAccount(supabase, calendar.provider_account_id, userId);
  return decryptAppleCredentials(account);
}

async function putAppleEvent(params: {
  credentials: ReturnType<typeof decryptAppleCredentials>;
  href: string;
  icsText: string;
}) {
  const contentType = "text/calendar; charset=utf-8";
  const response = await fetch(params.href, {
    method: "PUT",
    headers: {
      Authorization: getBasicAuthHeader(params.credentials.appleId, params.credentials.appPassword),
      "Content-Type": contentType,
    },
    body: params.icsText,
  });
  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    console.error("Apple CalDAV PUT failed", {
      status: response.status,
      host: new URL(params.href).host,
      body: responseText.slice(0, 180),
    });
    const refusedMessage = response.status === 401
      ? "Autorisation Apple expirée. Reconnectez Apple Calendar."
      : `Apple a refusé la création (${response.status} ${response.statusText || "sans libellé"}).`;
    throw new AppleProviderRequestError({
      message: refusedMessage,
      status: response.status,
      statusText: response.statusText,
      providerResponse: responseText.slice(0, 500) || null,
      requestHref: params.href,
      contentType,
    });
  }
  console.info("Apple CalDAV PUT succeeded", {
    status: response.status,
    host: new URL(params.href).host,
  });

  return {
    etag: response.headers.get("etag"),
    status: response.status,
  };
}

async function deleteAppleEvent(params: {
  credentials: ReturnType<typeof decryptAppleCredentials>;
  href: string;
}) {
  const response = await fetch(params.href, {
    method: "DELETE",
    headers: {
      Authorization: getBasicAuthHeader(params.credentials.appleId, params.credentials.appPassword),
    },
  });
  const responseText = await response.text().catch(() => "");
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    console.error("Apple CalDAV DELETE failed", {
      status: response.status,
      host: new URL(params.href).host,
      body: responseText.slice(0, 180),
    });
    throw new AppleProviderRequestError({
      message: response.status === 401 ? "Autorisation Apple expirée. Reconnectez Apple Calendar." : "Suppression Apple Calendar impossible.",
      status: response.status,
      statusText: response.statusText,
      providerResponse: responseText.slice(0, 500) || null,
      requestHref: params.href,
      contentType: null,
    });
  }
  console.info("Apple CalDAV DELETE completed", {
    status: response.status,
    host: new URL(params.href).host,
  });
  return { status: response.status };
}

async function deleteRemoteAppleEventQuietly(params: {
  credentials: ReturnType<typeof decryptAppleCredentials>;
  href: string;
}) {
  try {
    await deleteAppleEvent(params);
  } catch (error) {
    console.error("Apple CalDAV cleanup after link failure failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function createAppleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, event: ProductionEventRow, calendar: ExternalCalendarRow, userId: string) {
  const providerCalendarId = calendar.provider_calendar_id;
  if (!providerCalendarId) throw new Error("Calendrier Apple incomplet.");
  const credentials = await getAppleCredentialsForCalendar(supabase, calendar, userId);
  const uid = getAppleUid(event);
  const href = getAppleHref({ credentialsServerUrl: credentials.serverUrl, calendar, uid });
  const icsText = getAppleEventPayload(event, uid);
  const putResult = await putAppleEvent({ credentials, href, icsText });
  const now = new Date().toISOString();
  const rawExternalEvent = { href, etag: putResult.etag, uid };
  const linkPayload: ExternalEventLinkInsert = {
    event_id: event.id,
    external_calendar_id: calendar.id,
    provider_type: "apple_caldav",
    provider_calendar_id: providerCalendarId,
    external_event_id: uid,
    external_event_uid: uid,
    sync_direction: "bidirectional",
    sync_status: "synced",
    local_updated_at: event.updated_at,
    last_synced_at: now,
    last_external_updated_at: now,
    last_sync_error: null,
    raw_external_event: rawExternalEvent,
    created_at: now,
    updated_at: now,
  };

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("external_event_links")
    .select("id")
    .eq("event_id", event.id)
    .eq("external_calendar_id", calendar.id)
    .maybeSingle();

  if (existingLinkError) {
    await deleteRemoteAppleEventQuietly({ credentials, href });
    throw existingLinkError;
  }

  if (existingLink?.id) {
    const { error } = await supabase.from("external_event_links").update({
      provider_type: linkPayload.provider_type,
      provider_calendar_id: linkPayload.provider_calendar_id,
      external_event_id: linkPayload.external_event_id,
      external_event_uid: linkPayload.external_event_uid,
      sync_direction: linkPayload.sync_direction,
      sync_status: linkPayload.sync_status,
      local_updated_at: linkPayload.local_updated_at,
      last_synced_at: linkPayload.last_synced_at,
      last_external_updated_at: linkPayload.last_external_updated_at,
      last_sync_error: linkPayload.last_sync_error,
      raw_external_event: linkPayload.raw_external_event,
      updated_at: linkPayload.updated_at,
    }).eq("id", existingLink.id);
    if (error) {
      await deleteRemoteAppleEventQuietly({ credentials, href });
      throw error;
    }
  } else {
    const { error } = await supabase.from("external_event_links").insert(linkPayload);
    if (error) {
      await deleteRemoteAppleEventQuietly({ credentials, href });
      throw error;
    }
  }

  return { id: uid, href, etag: putResult.etag };
}

async function updateAppleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, event: ProductionEventRow, link: ExternalEventLinkRow, calendar: ExternalCalendarRow, userId: string) {
  const credentials = await getAppleCredentialsForCalendar(supabase, calendar, userId);
  const uid = getAppleUid(event, link);
  const href = getAppleHref({ credentialsServerUrl: credentials.serverUrl, calendar, uid, link });
  const icsText = getAppleEventPayload(event, uid);
  const now = new Date().toISOString();

  try {
    const putResult = await putAppleEvent({ credentials, href, icsText });
    const { error } = await supabase
      .from("external_event_links")
      .update({
        sync_status: "synced",
        local_updated_at: event.updated_at,
        last_synced_at: now,
        last_external_updated_at: now,
        last_sync_error: null,
        raw_external_event: { href, etag: putResult.etag, uid },
        updated_at: now,
      })
      .eq("id", link.id);
    if (error) throw error;
    return { id: uid, href, etag: putResult.etag };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation Apple Calendar impossible.";
    await supabase
      .from("external_event_links")
      .update({
        sync_status: "failed",
        last_sync_error: message,
        updated_at: now,
      })
      .eq("id", link.id);
    throw error;
  }
}

async function deleteAppleLinkedEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, link: ExternalEventLinkRow, calendar: ExternalCalendarRow, userId: string) {
  const credentials = await getAppleCredentialsForCalendar(supabase, calendar, userId);
  const uid = link.external_event_uid || link.external_event_id;
  const href = getAppleHref({ credentialsServerUrl: credentials.serverUrl, calendar, uid, link });
  await deleteAppleEvent({ credentials, href });

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "synced",
      deleted_locally_at: now,
      deleted_externally_at: now,
      last_synced_at: now,
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", link.id);

  if (error) throw error;
}

async function moveAppleLinkedEvent(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  event: ProductionEventRow,
  link: ExternalEventLinkRow,
  previousCalendar: ExternalCalendarRow,
  nextCalendar: ExternalCalendarRow,
  userId: string,
) {
  if (!nextCalendar.provider_calendar_id) {
    throw makeAppleMoveError("validate_target_calendar", "Calendrier Apple cible incomplet.", {
      status: 400,
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
    });
  }

  let previousCredentials: ReturnType<typeof decryptAppleCredentials>;
  try {
    previousCredentials = await getAppleCredentialsForCalendar(supabase, previousCalendar, userId);
  } catch (error) {
    throw makeAppleMoveError("old_credentials_lookup", "Impossible de charger les identifiants de l’ancien calendrier Apple.", {
      status: 500,
      details: getSafeErrorDetails(error),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
    });
  }

  let nextCredentials: ReturnType<typeof decryptAppleCredentials>;
  try {
    nextCredentials = await getAppleCredentialsForCalendar(supabase, nextCalendar, userId);
  } catch (error) {
    throw makeAppleMoveError("new_credentials_lookup", "Impossible de charger les identifiants du calendrier Apple cible.", {
      status: 500,
      details: getSafeErrorDetails(error),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
    });
  }

  const previousUid = getAppleUid(event, link);
  const targetUid = getAppleMoveTargetUid(event, nextCalendar);
  let previousHref: string;
  try {
    previousHref = getAppleHref({ credentialsServerUrl: previousCredentials.serverUrl, calendar: previousCalendar, uid: previousUid, link });
  } catch (error) {
    throw makeAppleMoveError("old_href_generation", "Impossible de retrouver l’adresse de l’ancien événement Apple.", {
      status: 500,
      details: getSafeErrorDetails(error),
      oldHrefExists: false,
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
      generatedUid: targetUid,
    });
  }

  let targetCalendarUrl: string;
  try {
    targetCalendarUrl = getAppleCalendarUrl(nextCredentials.serverUrl, nextCalendar);
  } catch (error) {
    throw makeAppleMoveError("target_calendar_url_generation", "Impossible de préparer l’adresse du calendrier Apple cible.", {
      status: 500,
      details: getSafeErrorDetails(error),
      oldHrefExists: Boolean(previousHref),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
      generatedUid: targetUid,
    });
  }

  let nextHref: string;
  try {
    nextHref = getAppleEventHrefFromCalendarUrl(targetCalendarUrl, targetUid);
  } catch (error) {
    throw makeAppleMoveError("new_href_generation", "Impossible de préparer l’adresse du nouvel événement Apple.", {
      status: 500,
      details: getSafeErrorDetails(error),
      oldHrefExists: Boolean(previousHref),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
      targetCalendarUrl,
      generatedUid: targetUid,
      targetCalendarUrlEndsWithSlash: targetCalendarUrl.endsWith("/"),
    });
  }

  let icsText: string;
  try {
    icsText = getAppleEventPayload(event, targetUid);
  } catch (error) {
    throw makeAppleMoveError("vevent_generation", "Impossible de générer l’événement Apple.", {
      status: 500,
      details: getSafeErrorDetails(error),
      oldHrefExists: Boolean(previousHref),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
      targetCalendarUrl,
      generatedEventHref: nextHref,
      generatedUid: targetUid,
      contentType: "text/calendar; charset=utf-8",
      targetCalendarUrlEndsWithSlash: targetCalendarUrl.endsWith("/"),
      finalPutUrl: nextHref,
    });
  }

  console.info("Apple calendar move payload", {
    eventId: event.id,
    linkId: link.id,
    previousCalendarId: previousCalendar.id,
    targetCalendarId: nextCalendar.id,
    previousUid,
    targetUid,
  });
  console.info("Apple calendar move hrefs", {
    oldHref: previousHref,
    newHref: nextHref,
    targetCalendarUrl,
    targetCalendarUrlEndsWithSlash: targetCalendarUrl.endsWith("/"),
  });
  let putResult: Awaited<ReturnType<typeof putAppleEvent>>;
  try {
    putResult = await putAppleEvent({ credentials: nextCredentials, href: nextHref, icsText });
  } catch (error) {
    const provider = getProviderErrorDetails(error);
    const providerStatus = provider.status ? `${provider.status} ${provider.statusText || ""}`.trim() : null;
    throw makeAppleMoveError("caldav_create", providerStatus ? `Apple a refusé la création (${providerStatus}).` : "Création du nouvel événement Apple impossible.", {
      status: provider.status,
      statusText: provider.statusText,
      details: getSafeErrorDetails(error),
      providerResponse: provider.providerResponse,
      oldHrefExists: Boolean(previousHref),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
      newPutStatus: provider.status ?? null,
      targetCalendarUrl,
      generatedEventHref: nextHref,
      generatedUid: targetUid,
      contentType: provider.contentType ?? "text/calendar; charset=utf-8",
      targetCalendarUrlEndsWithSlash: targetCalendarUrl.endsWith("/"),
      finalPutUrl: provider.requestHref ?? nextHref,
    });
  }
  const now = new Date().toISOString();

  const { error: linkUpdateError } = await supabase
    .from("external_event_links")
    .update({
      external_calendar_id: nextCalendar.id,
      provider_calendar_id: nextCalendar.provider_calendar_id,
      external_event_id: targetUid,
      external_event_uid: targetUid,
      sync_status: "synced",
      local_updated_at: event.updated_at,
      last_synced_at: now,
      last_external_updated_at: now,
      last_sync_error: null,
      deleted_locally_at: null,
      deleted_externally_at: null,
      raw_external_event: { href: nextHref, etag: putResult.etag, uid: targetUid },
      updated_at: now,
    })
    .eq("id", link.id);

  if (linkUpdateError) {
    await deleteRemoteAppleEventQuietly({ credentials: nextCredentials, href: nextHref });
    throw makeAppleMoveError("external_event_link_update", linkUpdateError.message || "MSTV n’a pas pu enregistrer le nouveau calendrier.", {
      status: 500,
      details: getSafeErrorDetails(linkUpdateError),
      oldHrefExists: Boolean(previousHref),
      targetCalendarId: nextCalendar.id,
      oldExternalCalendarId: previousCalendar.id,
      linkId: link.id,
      newPutStatus: putResult.status,
      targetCalendarUrl,
      generatedEventHref: nextHref,
      generatedUid: targetUid,
      contentType: "text/calendar; charset=utf-8",
      targetCalendarUrlEndsWithSlash: targetCalendarUrl.endsWith("/"),
      finalPutUrl: nextHref,
    });
  }

  let oldDeleteStatus: number | null = null;
  try {
    const deleteResult = await deleteAppleEvent({ credentials: previousCredentials, href: previousHref });
    oldDeleteStatus = deleteResult.status;
  } catch (error) {
    const provider = getProviderErrorDetails(error);
    oldDeleteStatus = provider.status ?? null;
    const warning = "L’événement a été déplacé, mais l’ancienne copie Apple n’a pas pu être supprimée.";
    console.error("Apple CalDAV old event cleanup after move failed", {
      message: error instanceof Error ? error.message : String(error),
      previousCalendarId: previousCalendar.id,
      nextCalendarId: nextCalendar.id,
      status: oldDeleteStatus,
    });
    await supabase
      .from("external_event_links")
      .update({
        last_sync_error: warning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);
    return { id: targetUid, href: nextHref, etag: putResult.etag, warning, newPutStatus: putResult.status, oldDeleteStatus };
  }

  return { id: targetUid, href: nextHref, etag: putResult.etag, warning: null, newPutStatus: putResult.status, oldDeleteStatus };
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as {
      action?: "create" | "update" | "delete" | "move";
      eventId?: string;
      externalCalendarId?: string;
    } | null;

    const action = body?.action;
    const eventId = body?.eventId?.trim();
    if (!action || !eventId) {
      return appleJsonResponse({ error: "Action Apple Calendar incomplète." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    if (action === "create") {
      const externalCalendarId = body.externalCalendarId?.trim();
      if (!externalCalendarId) {
        return appleJsonResponse({ error: "Calendrier Apple manquant." }, { status: 400 });
      }
      const event = await getEvent(supabase, eventId);
      const calendar = await getOwnedAppleCalendar(supabase, externalCalendarId, authResult.user.id);
      const appleEvent = await createAppleEvent(supabase, event, calendar, authResult.user.id);
      return appleJsonResponse({ ok: true, externalEventId: appleEvent.id });
    }

    if (action === "move") {
      const externalCalendarId = body.externalCalendarId?.trim();
      if (!externalCalendarId) {
        const details = makeAppleMoveError("validate_request", "Calendrier Apple cible manquant.", {
          status: 400,
          targetCalendarId: null,
          linkId: null,
        }).details;
        return appleJsonResponse({ success: false, ...details, error: details.message }, { status: 400 });
      }
      console.info("Apple move route requested", {
        eventId,
        targetExternalCalendarId: externalCalendarId,
      });
      let event: ProductionEventRow;
      try {
        event = await getEvent(supabase, eventId);
      } catch (error) {
        throw makeAppleMoveError("event_lookup", "Événement MSTV introuvable pour le déplacement Apple.", {
          status: 404,
          details: getSafeErrorDetails(error),
          targetCalendarId: externalCalendarId,
          linkId: null,
        });
      }

      let nextCalendar: ExternalCalendarRow;
      try {
        nextCalendar = await getOwnedAppleCalendar(supabase, externalCalendarId, authResult.user.id);
      } catch (error) {
        throw makeAppleMoveError("new_calendar_lookup", "Calendrier Apple cible introuvable ou désactivé.", {
          status: 404,
          details: getSafeErrorDetails(error),
          targetCalendarId: externalCalendarId,
          linkId: null,
        });
      }

      let links: Array<{ link: ExternalEventLinkRow; calendar: ExternalCalendarRow }>;
      try {
        links = await getAppleLinks(supabase, eventId, authResult.user.id);
      } catch (error) {
        throw makeAppleMoveError("old_link_lookup", "Impossible de charger l’ancien lien Apple Calendar.", {
          status: 500,
          details: getSafeErrorDetails(error),
          targetCalendarId: externalCalendarId,
          linkId: null,
        });
      }
      console.info("Apple move route link lookup", {
        eventId,
        targetExternalCalendarId: externalCalendarId,
        foundAppleLinkIds: links.map(({ link }) => link.id),
      });
      if (links.length === 0) {
        const details = makeAppleMoveError("find_existing_link", "Aucun lien Apple Calendar trouvé pour cet événement.", {
          status: 409,
          targetCalendarId: externalCalendarId,
          linkId: null,
        }).details;
        return appleJsonResponse({ success: false, ...details, error: details.message }, { status: 409 });
      }
      const movableLink = links.find(({ calendar }) => calendar.id !== nextCalendar.id) ?? links[0];
      if (!movableLink || movableLink.calendar.id === nextCalendar.id) {
        const details = makeAppleMoveError("compare_calendars", "L’événement est déjà dans ce calendrier Apple.", {
          status: 409,
          targetCalendarId: externalCalendarId,
          oldExternalCalendarId: movableLink?.calendar.id ?? null,
          linkId: movableLink?.link.id ?? null,
        }).details;
        return appleJsonResponse({ success: false, ...details, error: details.message }, { status: 409 });
      }
      console.info("Apple move route selected link", {
        eventId,
        targetExternalCalendarId: externalCalendarId,
        linkId: movableLink.link.id,
        previousExternalCalendarId: movableLink.calendar.id,
      });
      const moveResult = await moveAppleLinkedEvent(supabase, event, movableLink.link, movableLink.calendar, nextCalendar, authResult.user.id);
      return appleJsonResponse({
        ok: true,
        externalEventId: moveResult.id,
        synced: 1,
        warning: moveResult.warning,
        newPutStatus: moveResult.newPutStatus,
        oldDeleteStatus: moveResult.oldDeleteStatus,
      });
    }

    const links = await getAppleLinks(supabase, eventId, authResult.user.id);
    if (links.length === 0) {
      return appleJsonResponse({ ok: true, synced: 0 });
    }

    if (action === "update") {
      const event = await getEvent(supabase, eventId);
      for (const { link, calendar } of links) {
        await updateAppleEvent(supabase, event, link, calendar, authResult.user.id);
      }
      return appleJsonResponse({ ok: true, synced: links.length });
    }

    if (action === "delete") {
      for (const { link, calendar } of links) {
        await deleteAppleLinkedEvent(supabase, link, calendar, authResult.user.id);
      }
      return appleJsonResponse({ ok: true, synced: links.length });
    }

    return appleJsonResponse({ error: "Action Apple Calendar inconnue." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation Apple Calendar impossible.";
    if (error instanceof AppleMoveRouteError) {
      console.error("Apple move failed", error.details);
      return appleJsonResponse({ success: false, ...error.details, error: error.details.message }, { status: error.details.status && error.details.status >= 400 ? error.details.status : 500 });
    }
    console.error("Apple event sync failed", { message });
    return appleJsonResponse({ error: message }, { status: 500 });
  }
}
