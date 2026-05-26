import {
  getFreshGoogleAccessToken,
  getOwnedGoogleAccount,
  getServiceSupabaseClient,
  googleCalendarApiBaseUrl,
  googleCorsHeaders,
  googleJsonResponse,
  requireAuthenticatedUser,
} from "../_shared";
import type { Database } from "@/lib/supabase";

export const runtime = "nodejs";

type ProductionEventRow = Database["public"]["Tables"]["events"]["Row"];
type ExternalCalendarRow = Database["public"]["Tables"]["external_calendars"]["Row"];
type ExternalEventLinkRow = Database["public"]["Tables"]["external_event_links"]["Row"];

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: googleCorsHeaders,
  });
}

function normalizeGoogleTime(time: string | null) {
  if (!time) return "09:00:00";
  const [hours = "09", minutes = "00", seconds = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}

function getParisDateTime(date: string, time: string | null) {
  return `${date}T${normalizeGoogleTime(time)}`;
}

function addOneHour(time: string | null) {
  if (!time) return "10:00";
  const [hours = "09", minutes = "00"] = time.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(minutes));
  date.setHours(date.getHours() + 1);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getNextDate(dateKey: string) {
  const nextDate = new Date(`${dateKey}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

function toGoogleEventPayload(event: ProductionEventRow) {
  const summary = [event.client_name, event.event_name].filter(Boolean).join(" - ");

  if (event.is_all_day) {
    return {
      summary,
      description: event.notes ?? undefined,
      location: event.location ?? undefined,
      start: { date: event.date },
      end: { date: getNextDate(event.date) },
    };
  }

  const startTime = event.client_arrival_time ?? event.start_time ?? "09:00";
  const endTime = event.end_of_day_time ?? event.end_time ?? addOneHour(startTime);
  const payload = {
    summary,
    description: event.notes ?? undefined,
    location: event.location ?? undefined,
    start: {
      dateTime: getParisDateTime(event.date, startTime),
      timeZone: "Europe/Paris",
    },
    end: {
      dateTime: getParisDateTime(event.date, endTime),
      timeZone: "Europe/Paris",
    },
  };

  console.info("Google event payload prepared", {
    summary,
    date: event.date,
    startDateTime: payload.start.dateTime,
    endDateTime: payload.end.dateTime,
  });

  return payload;
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: { message?: string } } | null;
  console.info("Google Calendar API response", {
    method: init.method ?? "GET",
    status: response.status,
    ok: response.ok,
  });
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Synchronisation Google Calendar impossible.");
  }
  return payload as T;
}

async function getOwnedGoogleCalendar(supabase: ReturnType<typeof getServiceSupabaseClient>, calendarId: string, userId: string) {
  const { data: calendar, error } = await supabase
    .from("external_calendars")
    .select("*")
    .eq("id", calendarId)
    .eq("created_by_profile_id", userId)
    .eq("provider_type", "google")
    .eq("sync_capability", "bidirectional")
    .maybeSingle();

  if (error) throw error;
  if (!calendar?.provider_account_id || !calendar.provider_calendar_id) {
    throw new Error("Calendrier Google introuvable.");
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

async function getGoogleLinks(supabase: ReturnType<typeof getServiceSupabaseClient>, eventId: string, userId: string) {
  const { data: links, error } = await supabase
    .from("external_event_links")
    .select("*")
    .eq("event_id", eventId)
    .eq("provider_type", "google");

  if (error) throw error;
  const ownedLinks: Array<{ link: ExternalEventLinkRow; calendar: ExternalCalendarRow }> = [];

  for (const link of links ?? []) {
    const calendar = await getOwnedGoogleCalendar(supabase, link.external_calendar_id, userId);
    ownedLinks.push({ link, calendar });
  }

  return ownedLinks;
}

async function getGoogleAccessForCalendar(supabase: ReturnType<typeof getServiceSupabaseClient>, calendar: ExternalCalendarRow, userId: string) {
  if (!calendar.provider_account_id || !calendar.provider_calendar_id) {
    throw new Error("Calendrier Google incomplet.");
  }
  const account = await getOwnedGoogleAccount(supabase, calendar.provider_account_id, userId);
  const accessToken = await getFreshGoogleAccessToken(supabase, account);
  return { accessToken, providerCalendarId: calendar.provider_calendar_id };
}

async function createGoogleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, event: ProductionEventRow, calendar: ExternalCalendarRow, userId: string) {
  const { accessToken, providerCalendarId } = await getGoogleAccessForCalendar(supabase, calendar, userId);
  console.info("Google event create started", {
    eventId: event.id,
    externalCalendarId: calendar.id,
    providerCalendarIdPresent: Boolean(providerCalendarId),
    calendarProviderType: calendar.provider_type,
    calendarSyncCapability: calendar.sync_capability,
  });
  const googleEvent = await fetchJson<{ id: string; iCalUID?: string; updated?: string }>(
    `${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(toGoogleEventPayload(event)),
    },
  );
  console.info("Google event create API succeeded", {
    eventId: event.id,
    googleEventIdReturned: Boolean(googleEvent.id),
    googleEventUidReturned: Boolean(googleEvent.iCalUID),
  });

  const now = new Date().toISOString();
  const linkPayload = {
    provider_type: "google",
    provider_calendar_id: providerCalendarId,
    external_event_id: googleEvent.id,
    external_event_uid: googleEvent.iCalUID ?? null,
    sync_direction: "bidirectional",
    sync_status: "synced",
    local_updated_at: event.updated_at,
    last_synced_at: now,
    last_external_updated_at: googleEvent.updated ?? now,
    last_sync_error: null,
    deleted_locally_at: null,
    deleted_externally_at: null,
    updated_at: now,
  };

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("external_event_links")
    .select("id")
    .eq("event_id", event.id)
    .eq("external_calendar_id", calendar.id)
    .maybeSingle();

  if (existingLinkError) throw existingLinkError;

  if (existingLink?.id) {
    const { error } = await supabase.from("external_event_links").update(linkPayload).eq("id", existingLink.id);
    if (error) {
      console.error("Google external_event_links update failed", { eventId: event.id, externalCalendarId: calendar.id, message: error.message, code: error.code });
      throw error;
    }
    console.info("Google external_event_links update succeeded", { eventId: event.id, linkId: existingLink.id });
  } else {
    const { error } = await supabase.from("external_event_links").insert({
      ...linkPayload,
      event_id: event.id,
      external_calendar_id: calendar.id,
      created_at: now,
    });
    if (error) {
      console.error("Google external_event_links insert failed", { eventId: event.id, externalCalendarId: calendar.id, message: error.message, code: error.code });
      throw error;
    }
    console.info("Google external_event_links insert succeeded", { eventId: event.id, externalCalendarId: calendar.id });
  }
  return googleEvent;
}

async function updateGoogleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, event: ProductionEventRow, link: ExternalEventLinkRow, calendar: ExternalCalendarRow, userId: string) {
  const { accessToken, providerCalendarId } = await getGoogleAccessForCalendar(supabase, calendar, userId);
  console.info("Google event update started", {
    eventId: event.id,
    linkId: link.id,
    externalEventIdPresent: Boolean(link.external_event_id),
    externalCalendarId: calendar.id,
  });
  let googleEvent: { id: string; iCalUID?: string; updated?: string };
  try {
    googleEvent = await fetchJson<{ id: string; iCalUID?: string; updated?: string }>(
      `${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(link.external_event_id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(toGoogleEventPayload(event)),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation Google Calendar impossible.";
    await supabase
      .from("external_event_links")
      .update({
        sync_status: "failed",
        last_sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);
    throw error;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "synced",
      local_updated_at: event.updated_at,
      last_synced_at: now,
      last_external_updated_at: googleEvent.updated ?? now,
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", link.id);

  if (error) {
    console.error("Google sync_status update failed after event update", { eventId: event.id, linkId: link.id, message: error.message, code: error.code });
    throw error;
  }
  console.info("Google event update succeeded", { eventId: event.id, linkId: link.id, googleEventIdReturned: Boolean(googleEvent.id) });
  return googleEvent;
}

async function deleteGoogleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, link: ExternalEventLinkRow, calendar: ExternalCalendarRow, userId: string) {
  const { accessToken, providerCalendarId } = await getGoogleAccessForCalendar(supabase, calendar, userId);
  console.info("Google event delete started", {
    linkId: link.id,
    eventId: link.event_id,
    externalEventIdPresent: Boolean(link.external_event_id),
    externalCalendarId: calendar.id,
  });
  const response = await fetch(`${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(link.external_event_id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  console.info("Google event delete API response", { status: response.status, ok: response.ok, linkId: link.id });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const message = payload?.error?.message || "Suppression Google Calendar impossible.";
    await supabase
      .from("external_event_links")
      .update({
        sync_status: "failed",
        last_sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);
    throw new Error(message);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "synced",
      deleted_locally_at: now,
      last_synced_at: now,
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", link.id);

  if (error) {
    console.error("Google sync_status update failed after event delete", { linkId: link.id, message: error.message, code: error.code });
    throw error;
  }
  console.info("Google event delete succeeded", { linkId: link.id, eventId: link.event_id });
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as {
      action?: "create" | "update" | "delete";
      eventId?: string;
      externalCalendarId?: string;
    } | null;

    const action = body?.action;
    const eventId = body?.eventId?.trim();
    console.info("Google event sync route reached", {
      action,
      eventIdPresent: Boolean(eventId),
      externalCalendarIdPresent: Boolean(body?.externalCalendarId),
    });
    if (!action || !eventId) {
      return googleJsonResponse({ error: "Action Google Calendar incomplète." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const event = await getEvent(supabase, eventId);
    console.info("Google event sync MSTV event loaded", {
      action,
      eventId,
      eventDate: event.date,
      hasStartTime: Boolean(event.start_time),
      hasEndTime: Boolean(event.end_time),
    });

    if (action === "create") {
      const externalCalendarId = body.externalCalendarId?.trim();
      if (!externalCalendarId) {
        return googleJsonResponse({ error: "Calendrier Google manquant." }, { status: 400 });
      }
      const calendar = await getOwnedGoogleCalendar(supabase, externalCalendarId, authResult.user.id);
      console.info("Google event sync selected calendar loaded", {
        eventId,
        externalCalendarId: calendar.id,
        providerType: calendar.provider_type,
        syncCapability: calendar.sync_capability,
        syncEnabled: calendar.sync_enabled,
        providerCalendarIdPresent: Boolean(calendar.provider_calendar_id),
      });
      const googleEvent = await createGoogleEvent(supabase, event, calendar, authResult.user.id);
      return googleJsonResponse({ ok: true, externalEventId: googleEvent.id });
    }

    const links = await getGoogleLinks(supabase, eventId, authResult.user.id);
    console.info("Google event sync linked events lookup complete", {
      action,
      eventId,
      linkedGoogleEventFound: links.length > 0,
      linkCount: links.length,
    });
    if (links.length === 0) {
      return googleJsonResponse({ ok: true, synced: 0 });
    }

    if (action === "update") {
      for (const { link, calendar } of links) {
        await updateGoogleEvent(supabase, event, link, calendar, authResult.user.id);
      }
      return googleJsonResponse({ ok: true, synced: links.length });
    }

    if (action === "delete") {
      for (const { link, calendar } of links) {
        await deleteGoogleEvent(supabase, link, calendar, authResult.user.id);
      }
      return googleJsonResponse({ ok: true, synced: links.length });
    }

    return googleJsonResponse({ error: "Action Google Calendar inconnue." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation Google Calendar impossible.";
    console.error("Google event sync failed", { message });
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}
