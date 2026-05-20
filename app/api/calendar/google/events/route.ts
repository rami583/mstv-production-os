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

function getParisDateTime(date: string, time: string | null) {
  return `${date}T${time || "09:00"}:00`;
}

function addOneHour(time: string | null) {
  if (!time) return "10:00";
  const [hours = "09", minutes = "00"] = time.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(minutes));
  date.setHours(date.getHours() + 1);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toGoogleEventPayload(event: ProductionEventRow) {
  const summary = [event.client_name, event.event_name].filter(Boolean).join(" - ");
  const hasTimedRange = Boolean(event.start_time || event.end_time);

  if (!hasTimedRange) {
    const nextDate = new Date(`${event.date}T12:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    return {
      summary,
      description: "Synchronisé depuis MSTV Production OS.",
      start: { date: event.date },
      end: { date: nextDate.toISOString().slice(0, 10) },
    };
  }

  const startTime = event.start_time ?? event.client_arrival_time ?? "09:00";
  const endTime = event.end_time ?? addOneHour(startTime);

  return {
    summary,
    description: "Synchronisé depuis MSTV Production OS.",
    start: {
      dateTime: getParisDateTime(event.date, startTime),
      timeZone: "Europe/Paris",
    },
    end: {
      dateTime: getParisDateTime(event.date, endTime),
      timeZone: "Europe/Paris",
    },
  };
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: { message?: string } } | null;
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

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("external_event_links")
    .upsert(
      {
        event_id: event.id,
        external_calendar_id: calendar.id,
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
        updated_at: now,
      },
      { onConflict: "event_id,external_calendar_id" },
    );

  if (error) throw error;
  return googleEvent;
}

async function updateGoogleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, event: ProductionEventRow, link: ExternalEventLinkRow, calendar: ExternalCalendarRow, userId: string) {
  const { accessToken, providerCalendarId } = await getGoogleAccessForCalendar(supabase, calendar, userId);
  const googleEvent = await fetchJson<{ id: string; iCalUID?: string; updated?: string }>(
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

  if (error) throw error;
  return googleEvent;
}

async function deleteGoogleEvent(supabase: ReturnType<typeof getServiceSupabaseClient>, link: ExternalEventLinkRow, calendar: ExternalCalendarRow, userId: string) {
  const { accessToken, providerCalendarId } = await getGoogleAccessForCalendar(supabase, calendar, userId);
  const response = await fetch(`${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(link.external_event_id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || "Suppression Google Calendar impossible.");
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

  if (error) throw error;
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
    if (!action || !eventId) {
      return googleJsonResponse({ error: "Action Google Calendar incomplète." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const event = await getEvent(supabase, eventId);

    if (action === "create") {
      const externalCalendarId = body.externalCalendarId?.trim();
      if (!externalCalendarId) {
        return googleJsonResponse({ error: "Calendrier Google manquant." }, { status: 400 });
      }
      const calendar = await getOwnedGoogleCalendar(supabase, externalCalendarId, authResult.user.id);
      const googleEvent = await createGoogleEvent(supabase, event, calendar, authResult.user.id);
      return googleJsonResponse({ ok: true, externalEventId: googleEvent.id });
    }

    const links = await getGoogleLinks(supabase, eventId, authResult.user.id);
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
