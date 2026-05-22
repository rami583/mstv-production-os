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

function getAppleHref(input: { credentialsServerUrl: string; calendar: ExternalCalendarRow; uid: string; link?: ExternalEventLinkRow | null }) {
  const rawHref = input.link?.raw_external_event && typeof input.link.raw_external_event === "object"
    ? (input.link.raw_external_event as { href?: unknown }).href
    : null;
  if (typeof rawHref === "string" && rawHref.trim()) {
    return joinCalDavUrl(input.credentialsServerUrl, rawHref);
  }

  if (!input.calendar.provider_calendar_id) {
    throw new Error("Calendrier Apple incomplet.");
  }

  const calendarUrl = joinCalDavUrl(input.credentialsServerUrl, input.calendar.provider_calendar_id);
  return new URL(`${encodeURIComponent(input.uid)}.ics`, calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`).toString();
}

function getAppleEventPayload(event: ProductionEventRow, uid: string) {
  const summary = [event.client_name, event.event_name].filter(Boolean).join(" - ");
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
  const response = await fetch(params.href, {
    method: "PUT",
    headers: {
      Authorization: getBasicAuthHeader(params.credentials.appleId, params.credentials.appPassword),
      "Content-Type": "text/calendar; charset=utf-8",
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
    throw new Error(response.status === 401 ? "Autorisation Apple expirée. Reconnectez Apple Calendar." : "Synchronisation Apple Calendar impossible.");
  }

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
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const responseText = await response.text().catch(() => "");
    console.error("Apple CalDAV DELETE failed", {
      status: response.status,
      host: new URL(params.href).host,
      body: responseText.slice(0, 180),
    });
    throw new Error(response.status === 401 ? "Autorisation Apple expirée. Reconnectez Apple Calendar." : "Suppression Apple Calendar impossible.");
  }
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
    throw new Error("Calendrier Apple incomplet.");
  }

  const previousCredentials = await getAppleCredentialsForCalendar(supabase, previousCalendar, userId);
  const nextCredentials = await getAppleCredentialsForCalendar(supabase, nextCalendar, userId);
  const uid = getAppleUid(event, link);
  const previousHref = getAppleHref({ credentialsServerUrl: previousCredentials.serverUrl, calendar: previousCalendar, uid, link });
  const nextHref = getAppleHref({ credentialsServerUrl: nextCredentials.serverUrl, calendar: nextCalendar, uid });
  const icsText = getAppleEventPayload(event, uid);
  const putResult = await putAppleEvent({ credentials: nextCredentials, href: nextHref, icsText });
  const now = new Date().toISOString();

  const { error: linkUpdateError } = await supabase
    .from("external_event_links")
    .update({
      external_calendar_id: nextCalendar.id,
      provider_calendar_id: nextCalendar.provider_calendar_id,
      external_event_id: uid,
      external_event_uid: uid,
      sync_status: "synced",
      local_updated_at: event.updated_at,
      last_synced_at: now,
      last_external_updated_at: now,
      last_sync_error: null,
      deleted_locally_at: null,
      deleted_externally_at: null,
      raw_external_event: { href: nextHref, etag: putResult.etag, uid },
      updated_at: now,
    })
    .eq("id", link.id);

  if (linkUpdateError) {
    await deleteRemoteAppleEventQuietly({ credentials: nextCredentials, href: nextHref });
    throw linkUpdateError;
  }

  try {
    await deleteAppleEvent({ credentials: previousCredentials, href: previousHref });
  } catch (error) {
    const warning = "L’événement a été déplacé, mais l’ancienne copie Apple n’a pas pu être supprimée.";
    console.error("Apple CalDAV old event cleanup after move failed", {
      message: error instanceof Error ? error.message : String(error),
      previousCalendarId: previousCalendar.id,
      nextCalendarId: nextCalendar.id,
    });
    await supabase
      .from("external_event_links")
      .update({
        last_sync_error: warning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);
    return { id: uid, href: nextHref, etag: putResult.etag, warning };
  }

  return { id: uid, href: nextHref, etag: putResult.etag, warning: null };
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
    const event = await getEvent(supabase, eventId);

    if (action === "create") {
      const externalCalendarId = body.externalCalendarId?.trim();
      if (!externalCalendarId) {
        return appleJsonResponse({ error: "Calendrier Apple manquant." }, { status: 400 });
      }
      const calendar = await getOwnedAppleCalendar(supabase, externalCalendarId, authResult.user.id);
      const appleEvent = await createAppleEvent(supabase, event, calendar, authResult.user.id);
      return appleJsonResponse({ ok: true, externalEventId: appleEvent.id });
    }

    if (action === "move") {
      const externalCalendarId = body.externalCalendarId?.trim();
      if (!externalCalendarId) {
        return appleJsonResponse({ error: "Calendrier Apple manquant." }, { status: 400 });
      }
      const nextCalendar = await getOwnedAppleCalendar(supabase, externalCalendarId, authResult.user.id);
      const links = await getAppleLinks(supabase, eventId, authResult.user.id);
      if (links.length === 0) {
        return appleJsonResponse({ error: "Aucun lien Apple Calendar trouvé pour cet événement." }, { status: 409 });
      }
      const movableLink = links.find(({ calendar }) => calendar.id !== nextCalendar.id) ?? links[0];
      if (!movableLink || movableLink.calendar.id === nextCalendar.id) {
        return appleJsonResponse({ ok: true, synced: 0 });
      }
      const moveResult = await moveAppleLinkedEvent(supabase, event, movableLink.link, movableLink.calendar, nextCalendar, authResult.user.id);
      return appleJsonResponse({ ok: true, externalEventId: moveResult.id, synced: 1, warning: moveResult.warning });
    }

    const links = await getAppleLinks(supabase, eventId, authResult.user.id);
    if (links.length === 0) {
      return appleJsonResponse({ ok: true, synced: 0 });
    }

    if (action === "update") {
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
    console.error("Apple event sync failed", { message });
    return appleJsonResponse({ error: message }, { status: 500 });
  }
}
