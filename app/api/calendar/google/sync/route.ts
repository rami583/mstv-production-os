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
type ExternalEventLinkInsert = Database["public"]["Tables"]["external_event_links"]["Insert"];
type SyncFailureKind = "google_auth" | "google_api" | "supabase_write" | "supabase_read" | "generic";
type SyncFailureStage =
  | "google_auth"
  | "google_api"
  | "supabase_read"
  | "supabase_insert"
  | "supabase_update"
  | "supabase_upsert"
  | "supabase_write"
  | "unknown";

type SafeSupabaseError = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

class GooglePullSyncError extends Error {
  kind: SyncFailureKind;
  stage: SyncFailureStage;
  safeError: SafeSupabaseError | null;

  constructor(kind: SyncFailureKind, message: string, stage: SyncFailureStage = "unknown", safeError: SafeSupabaseError | null = null) {
    super(message);
    this.name = "GooglePullSyncError";
    this.kind = kind;
    this.stage = stage;
    this.safeError = safeError;
  }
}

type GoogleEvent = {
  id: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  status?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: googleCorsHeaders,
  });
}

function parseGoogleDate(value?: string) {
  if (!value) return null;
  return value.slice(0, 10);
}

function parseGoogleTime(value?: string) {
  if (!value) return null;
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function parseGoogleSummary(summary?: string) {
  const cleanSummary = summary?.trim() || "Google Calendar";
  const separators = [" - ", " – ", " — ", " | ", " : ", " / "];

  for (const separator of separators) {
    const index = cleanSummary.indexOf(separator);
    if (index > 0) {
      const clientName = cleanSummary.slice(0, index).trim();
      const eventName = cleanSummary.slice(index + separator.length).trim();
      if (clientName && eventName) return { clientName, eventName };
    }
  }

  return { clientName: cleanSummary, eventName: "Événement Google" };
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

function mapGoogleEventToMstvEvent(event: GoogleEvent) {
  const parsedSummary = parseGoogleSummary(event.summary);
  const date = parseGoogleDate(event.start?.date ?? event.start?.dateTime) ?? new Date().toISOString().slice(0, 10);
  return {
    client_name: parsedSummary.clientName,
    event_name: parsedSummary.eventName,
    date,
    client_arrival_time: null,
    start_time: event.start?.date ? null : parseGoogleTime(event.start?.dateTime),
    end_time: event.end?.date ? null : parseGoogleTime(event.end?.dateTime),
    end_of_day_time: null,
  };
}

function mapMstvEventToGooglePayload(event: ProductionEventRow) {
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

function getTimestamp(value?: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isAfter(value?: string | null, base?: string | null) {
  const valueTimestamp = getTimestamp(value);
  const baseTimestamp = getTimestamp(base);
  return valueTimestamp !== null && baseTimestamp !== null && valueTimestamp > baseTimestamp;
}

function compareTimestamps(left?: string | null, right?: string | null) {
  const leftTimestamp = getTimestamp(left);
  const rightTimestamp = getTimestamp(right);
  if (leftTimestamp === null || rightTimestamp === null) return "unknown";
  if (leftTimestamp > rightTimestamp) return "left";
  if (rightTimestamp > leftTimestamp) return "right";
  return "equal";
}

function getGoogleSyncWindow() {
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setFullYear(timeMin.getFullYear() - 1);
  const timeMax = new Date(now);
  timeMax.setFullYear(timeMax.getFullYear() + 2);

  return {
    timeMin,
    timeMax,
    startDate: timeMin.toISOString().slice(0, 10),
    endDate: timeMax.toISOString().slice(0, 10),
  };
}

async function fetchGoogleEvents(accessToken: string, providerCalendarId: string, syncWindow: ReturnType<typeof getGoogleSyncWindow>) {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("timeMin", syncWindow.timeMin.toISOString());
    url.searchParams.set("timeMax", syncWindow.timeMax.toISOString());
    url.searchParams.set("orderBy", "startTime");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as { items?: GoogleEvent[]; nextPageToken?: string; error?: { message?: string } } | null;

    if (!response.ok) {
      throw new GooglePullSyncError("google_api", payload?.error?.message || "Impossible de lire ce calendrier Google.");
    }

    events.push(...(payload?.items ?? []));
    pageToken = payload?.nextPageToken;
  } while (pageToken);

  return events;
}

async function fetchGoogleEventById(accessToken: string, providerCalendarId: string, externalEventId: string) {
  const response = await fetch(
    `${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(externalEventId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 404 || response.status === 410) return null;

  const payload = (await response.json().catch(() => null)) as (GoogleEvent & { error?: { message?: string } }) | null;
  if (!response.ok) {
    throw new GooglePullSyncError("google_api", payload?.error?.message || "Impossible de lire ce calendrier Google.");
  }

  return payload?.status === "cancelled" ? null : payload;
}

async function updateGoogleEventFromMstv(params: {
  accessToken: string;
  providerCalendarId: string;
  externalEventId: string;
  event: ProductionEventRow;
}) {
  const { accessToken, providerCalendarId, externalEventId, event } = params;
  const response = await fetch(
    `${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(externalEventId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mapMstvEventToGooglePayload(event)),
    },
  );
  const payload = (await response.json().catch(() => null)) as (GoogleEvent & { error?: { message?: string } }) | null;

  if (!response.ok) {
    throw new GooglePullSyncError("google_api", payload?.error?.message || "Impossible de mettre à jour ce calendrier Google.");
  }
  if (!payload?.id) {
    throw new GooglePullSyncError("google_api", "Google Calendar n’a pas renvoyé l’événement mis à jour.");
  }

  return payload;
}

async function deleteGoogleEventFromMstv(params: {
  accessToken: string;
  providerCalendarId: string;
  externalEventId: string;
}) {
  const { accessToken, providerCalendarId, externalEventId } = params;
  const response = await fetch(
    `${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(externalEventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new GooglePullSyncError("google_api", payload?.error?.message || "Impossible de supprimer cet événement Google.");
  }
}

function getSafeSupabaseError(error: unknown): SafeSupabaseError {
  if (!error || typeof error !== "object") {
    return {
      message: String(error),
      code: null,
      details: null,
      hint: null,
    };
  }
  const maybeError = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    message: typeof maybeError.message === "string" ? maybeError.message : String(error),
    code: typeof maybeError.code === "string" ? maybeError.code : null,
    details: typeof maybeError.details === "string" ? maybeError.details : null,
    hint: typeof maybeError.hint === "string" ? maybeError.hint : null,
  };
}

function throwSupabaseSyncError(kind: "supabase_read" | "supabase_write", step: string, error: unknown): never {
  const safeError = getSafeSupabaseError(error);
  const stage: SyncFailureStage = step.startsWith("insert_")
    ? "supabase_insert"
    : step.startsWith("update_") || step.startsWith("mark_")
      ? "supabase_update"
      : kind === "supabase_read"
        ? "supabase_read"
        : "supabase_write";
  console.error("Google pull sync Supabase step failed", {
    step,
    stage,
    ...safeError,
  });
  throw new GooglePullSyncError(kind, "Google a été lu, mais MSTV n’a pas pu enregistrer les événements.", stage, safeError);
}

async function softDeleteOrphanedInsertedEvent(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  eventId: string,
) {
  const { error } = await supabase
    .from("events")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: "external_link_creation_failed",
    })
    .eq("id", eventId);

  if (error) {
    console.error("Google pull sync failed to hide orphan event after link creation failure", {
      eventId,
      ...getSafeSupabaseError(error),
    });
  }
}

async function insertGoogleExternalEventLinkOrRollback(params: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  insertedEventId: string;
  payload: ExternalEventLinkInsert;
}) {
  const { supabase, insertedEventId, payload } = params;
  const { error } = await supabase.from("external_event_links").insert(payload);
  if (!error) return;

  await softDeleteOrphanedInsertedEvent(supabase, insertedEventId);
  throwSupabaseSyncError("supabase_write", "insert_external_event_link", error);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
}

function getUserMessageForSyncError(error: unknown) {
  if (error instanceof GooglePullSyncError) {
    if (error.kind === "google_auth") return "Autorisation Google expirée. Reconnectez Google Calendar.";
    if (error.kind === "google_api") return "Impossible de lire ce calendrier Google.";
    if (error.kind === "supabase_read" || error.kind === "supabase_write") return "Google a été lu, mais MSTV n’a pas pu enregistrer les événements.";
  }

  const message = getErrorMessage(error);
  if (/invalid_grant|token|refresh|unauthorized|auth/i.test(message)) {
    return "Autorisation Google expirée. Reconnectez Google Calendar.";
  }
  if (/Google|calendar|calendrier/i.test(message)) {
    return "Impossible de lire ce calendrier Google.";
  }
  return "Impossible de synchroniser ce calendrier.";
}

async function markGoogleDeletedEvents(params: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  accessToken: string;
  calendar: { id: string; provider_calendar_id: string };
  currentGoogleEventIds: Set<string>;
  syncWindow: ReturnType<typeof getGoogleSyncWindow>;
}) {
  const { supabase, accessToken, calendar, currentGoogleEventIds, syncWindow } = params;
  const { data: links, error: linksError } = await supabase
    .from("external_event_links")
    .select("id,event_id,external_event_id,deleted_externally_at,deleted_locally_at")
    .eq("external_calendar_id", calendar.id)
    .eq("provider_type", "google")
    .is("deleted_externally_at", null)
    .is("deleted_locally_at", null);

  if (linksError) throwSupabaseSyncError("supabase_read", "load_google_event_links_for_deletion", linksError);

  const missingLinks = (links ?? []).filter((link) => link.external_event_id && !currentGoogleEventIds.has(link.external_event_id));
  if (missingLinks.length === 0) return 0;

  const eventIds = Array.from(new Set(missingLinks.map((link) => link.event_id).filter(Boolean)));
  if (eventIds.length === 0) return 0;

  const { data: linkedEvents, error: eventsError } = await supabase
    .from("events")
    .select("id,date,deleted_at")
    .in("id", eventIds);

  if (eventsError) throwSupabaseSyncError("supabase_read", "load_mstv_events_for_google_deletion", eventsError);

  const eventById = new Map((linkedEvents ?? []).map((event) => [event.id, event]));
  let deleted = 0;

  for (const link of missingLinks) {
    const localEvent = eventById.get(link.event_id);
    if (!localEvent) continue;
    if (localEvent.date < syncWindow.startDate || localEvent.date > syncWindow.endDate) continue;

    const googleEvent = await fetchGoogleEventById(accessToken, calendar.provider_calendar_id, link.external_event_id);
    if (googleEvent) continue;

    const now = new Date().toISOString();

    if (!localEvent.deleted_at) {
      const { error: deleteError } = await supabase
        .from("events")
        .update({
          deleted_at: now,
          deleted_by: "Google Calendar",
        })
        .eq("id", localEvent.id);

      if (deleteError) throwSupabaseSyncError("supabase_write", "mark_mstv_event_deleted_from_google", deleteError);
      deleted += 1;
    }

    const { error: linkUpdateError } = await supabase
      .from("external_event_links")
      .update({
        deleted_externally_at: now,
        sync_status: "synced",
        last_synced_at: now,
        last_sync_error: null,
        updated_at: now,
      })
      .eq("id", link.id);

    if (linkUpdateError) throwSupabaseSyncError("supabase_write", "mark_external_event_link_deleted_from_google", linkUpdateError);
  }

  return deleted;
}

async function markLinkedEventConflict(params: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  linkId: string;
  providerUpdatedAt: string;
  googleEvent: GoogleEvent;
}) {
  const { supabase, linkId, providerUpdatedAt, googleEvent } = params;
  const { error } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "conflict",
      conflict_detected_at: new Date().toISOString(),
      conflict_reason: "Conflit de synchronisation détecté. Vérifiez l’événement avant de continuer.",
      last_external_updated_at: providerUpdatedAt,
      raw_external_event: googleEvent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", linkId);

  if (error) throwSupabaseSyncError("supabase_write", "mark_external_event_link_conflict", error);
}

async function pullGoogleEventIntoMstv(params: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  linkId: string;
  localEventId: string;
  values: ReturnType<typeof mapGoogleEventToMstvEvent>;
  googleEvent: GoogleEvent;
  providerUpdatedAt: string;
}) {
  const { supabase, linkId, localEventId, values, googleEvent, providerUpdatedAt } = params;
  const { data: updatedEvent, error: updateError } = await supabase
    .from("events")
    .update(values)
    .eq("id", localEventId)
    .select()
    .single();

  if (updateError) throwSupabaseSyncError("supabase_write", "update_mstv_event_from_google", updateError);

  const now = new Date().toISOString();
  const { error: linkUpdateError } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "synced",
      local_updated_at: updatedEvent.updated_at,
      last_synced_at: now,
      last_external_updated_at: providerUpdatedAt,
      conflict_detected_at: null,
      conflict_reason: null,
      last_sync_error: null,
      raw_external_event: googleEvent,
      updated_at: now,
    })
    .eq("id", linkId);

  if (linkUpdateError) throwSupabaseSyncError("supabase_write", "update_external_event_link_after_pull", linkUpdateError);
}

async function pushMstvEventToGoogle(params: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  accessToken: string;
  providerCalendarId: string;
  linkId: string;
  externalEventId: string;
  event: ProductionEventRow;
}) {
  const { supabase, accessToken, providerCalendarId, linkId, externalEventId, event } = params;
  const googleEvent = await updateGoogleEventFromMstv({
    accessToken,
    providerCalendarId,
    externalEventId,
    event,
  });
  const now = new Date().toISOString();
  const providerUpdatedAt = googleEvent.updated ?? now;
  const { error: linkUpdateError } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "synced",
      local_updated_at: event.updated_at,
      last_synced_at: now,
      last_external_updated_at: providerUpdatedAt,
      conflict_detected_at: null,
      conflict_reason: null,
      last_sync_error: null,
      raw_external_event: googleEvent,
      updated_at: now,
    })
    .eq("id", linkId);

  if (linkUpdateError) throwSupabaseSyncError("supabase_write", "update_external_event_link_after_push", linkUpdateError);
}

async function pushMstvDeletionToGoogle(params: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  accessToken: string;
  providerCalendarId: string;
  linkId: string;
  externalEventId: string;
}) {
  const { supabase, accessToken, providerCalendarId, linkId, externalEventId } = params;
  await deleteGoogleEventFromMstv({
    accessToken,
    providerCalendarId,
    externalEventId,
  });

  const now = new Date().toISOString();
  const { error: linkUpdateError } = await supabase
    .from("external_event_links")
    .update({
      sync_status: "synced",
      deleted_locally_at: now,
      last_synced_at: now,
      last_sync_error: null,
      updated_at: now,
    })
    .eq("id", linkId);

  if (linkUpdateError) throwSupabaseSyncError("supabase_write", "mark_external_event_link_deleted_locally", linkUpdateError);
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { externalCalendarId?: string } | null;
    const externalCalendarId = body?.externalCalendarId?.trim();
    if (!externalCalendarId) {
      return googleJsonResponse({ error: "Calendrier Google manquant." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: calendar, error: calendarError } = await supabase
      .from("external_calendars")
      .select("*")
      .eq("id", externalCalendarId)
      .eq("created_by_profile_id", authResult.user.id)
      .eq("provider_type", "google")
      .eq("sync_capability", "bidirectional")
      .maybeSingle();

    if (calendarError) throwSupabaseSyncError("supabase_read", "load_external_calendar", calendarError);
    if (!calendar?.provider_account_id || !calendar.provider_calendar_id) {
      return googleJsonResponse({ error: "Calendrier Google introuvable." }, { status: 404 });
    }

    const { error: startSyncError } = await supabase
      .from("external_calendars")
      .update({
        last_sync_started_at: new Date().toISOString(),
        last_sync_status: "syncing",
        last_sync_error: null,
      })
      .eq("id", calendar.id);
    if (startSyncError) throwSupabaseSyncError("supabase_write", "mark_calendar_syncing", startSyncError);

    let accessToken: string;
    try {
      const account = await getOwnedGoogleAccount(supabase, calendar.provider_account_id, authResult.user.id);
      accessToken = await getFreshGoogleAccessToken(supabase, account);
    } catch (authError) {
      console.error("Google pull sync auth/token step failed", {
        message: getErrorMessage(authError),
      });
      throw new GooglePullSyncError("google_auth", "Autorisation Google expirée. Reconnectez Google Calendar.", "google_auth");
    }
    const syncWindow = getGoogleSyncWindow();
    const googleEvents = await fetchGoogleEvents(accessToken, calendar.provider_calendar_id, syncWindow);
    const currentGoogleEventIds = new Set(googleEvents.map((event) => event.id).filter(Boolean));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let conflicts = 0;
    let deleted = 0;

    for (const googleEvent of googleEvents) {
      const providerUpdatedAt = googleEvent.updated ?? new Date().toISOString();
      const { data: existingLink, error: linkError } = await supabase
        .from("external_event_links")
        .select("*")
        .eq("external_calendar_id", calendar.id)
        .eq("external_event_id", googleEvent.id)
        .limit(1)
        .maybeSingle();

      if (linkError) throwSupabaseSyncError("supabase_read", "lookup_external_event_link", linkError);
      const values = mapGoogleEventToMstvEvent(googleEvent);

      if (!existingLink) {
        if (!calendar.id || !calendar.provider_calendar_id || !googleEvent.id) {
          throw new GooglePullSyncError(
            "supabase_write",
            "Google a été lu, mais MSTV n’a pas pu enregistrer les événements.",
            "supabase_insert",
            {
              message: "Identifiants Google incomplets pour créer le lien externe.",
              code: null,
              details: null,
              hint: null,
            },
          );
        }

        const { data: insertedEvent, error: insertError } = await supabase
          .from("events")
          .insert({
            ...values,
            imported_from: "google_calendar",
            external_import_id: googleEvent.id,
            event_role: calendar.calendar_role === "business_primary" ? "production" : "external_context",
          })
          .select()
          .single();

        if (insertError) throwSupabaseSyncError("supabase_write", "insert_mstv_event_from_google", insertError);

        const now = new Date().toISOString();
        const linkInsertPayload = {
          event_id: insertedEvent.id,
          external_calendar_id: calendar.id,
          provider_type: "google",
          provider_calendar_id: calendar.provider_calendar_id,
          external_event_id: googleEvent.id,
          external_event_uid: googleEvent.iCalUID ?? null,
          sync_direction: "bidirectional",
          sync_status: "synced",
          local_updated_at: insertedEvent.updated_at,
          last_synced_at: now,
          last_external_updated_at: providerUpdatedAt,
          raw_external_event: googleEvent,
        };
        await insertGoogleExternalEventLinkOrRollback({
          supabase,
          insertedEventId: insertedEvent.id,
          payload: linkInsertPayload,
        });
        created += 1;
        continue;
      }

      const { data: localEvent, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", existingLink.event_id)
        .maybeSingle();

      if (eventError) throwSupabaseSyncError("supabase_read", "load_linked_mstv_event", eventError);
      if (!localEvent) {
        unchanged += 1;
        continue;
      }

      const lastSyncedAt = existingLink.last_synced_at ?? existingLink.created_at;
      const providerChanged = isAfter(providerUpdatedAt, lastSyncedAt);
      const localChanged = isAfter(localEvent.updated_at, lastSyncedAt);

      if (localEvent.deleted_at) {
        if (localChanged && (!providerChanged || compareTimestamps(localEvent.updated_at, providerUpdatedAt) === "left")) {
          await pushMstvDeletionToGoogle({
            supabase,
            accessToken,
            providerCalendarId: calendar.provider_calendar_id,
            linkId: existingLink.id,
            externalEventId: existingLink.external_event_id,
          });
          deleted += 1;
        } else if (providerChanged) {
          await markLinkedEventConflict({
            supabase,
            linkId: existingLink.id,
            providerUpdatedAt,
            googleEvent,
          });
          conflicts += 1;
        } else {
          unchanged += 1;
        }
        continue;
      }

      if (providerChanged && localChanged) {
        const winner = compareTimestamps(providerUpdatedAt, localEvent.updated_at);
        if (winner === "left") {
          await pullGoogleEventIntoMstv({
            supabase,
            linkId: existingLink.id,
            localEventId: localEvent.id,
            values,
            googleEvent,
            providerUpdatedAt,
          });
          updated += 1;
        } else if (winner === "right") {
          await pushMstvEventToGoogle({
            supabase,
            accessToken,
            providerCalendarId: calendar.provider_calendar_id,
            linkId: existingLink.id,
            externalEventId: existingLink.external_event_id,
            event: localEvent,
          });
          updated += 1;
        } else {
          await markLinkedEventConflict({
            supabase,
            linkId: existingLink.id,
            providerUpdatedAt,
            googleEvent,
          });
          conflicts += 1;
        }
        continue;
      }

      if (providerChanged) {
        await pullGoogleEventIntoMstv({
          supabase,
          linkId: existingLink.id,
          localEventId: localEvent.id,
          values,
          googleEvent,
          providerUpdatedAt,
        });
        updated += 1;
      } else if (localChanged) {
        await pushMstvEventToGoogle({
          supabase,
          accessToken,
          providerCalendarId: calendar.provider_calendar_id,
          linkId: existingLink.id,
          externalEventId: existingLink.external_event_id,
          event: localEvent,
        });
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    deleted = await markGoogleDeletedEvents({
      supabase,
      accessToken,
      calendar: {
        id: calendar.id,
        provider_calendar_id: calendar.provider_calendar_id,
      },
      currentGoogleEventIds,
      syncWindow,
    });

    const finishedAt = new Date().toISOString();
    const { error: finishSyncError } = await supabase
      .from("external_calendars")
      .update({
        last_sync_finished_at: finishedAt,
        last_sync_status: conflicts > 0 ? "conflict" : "synced",
        last_sync_error: conflicts > 0 ? "Conflit de synchronisation détecté. Vérifiez l’événement avant de continuer." : null,
      })
      .eq("id", calendar.id);
    if (finishSyncError) throwSupabaseSyncError("supabase_write", "mark_calendar_sync_finished", finishSyncError);

    return googleJsonResponse({
      synced: googleEvents.length,
      total: googleEvents.length,
      created,
      updated,
      unchanged,
      conflicts,
      deleted,
    });
  } catch (error) {
    const message = getUserMessageForSyncError(error);
    console.error("Google calendar pull sync failed", {
      message,
      technicalMessage: getErrorMessage(error),
      kind: error instanceof GooglePullSyncError ? error.kind : "unknown",
      stage: error instanceof GooglePullSyncError ? error.stage : "unknown",
      error: error instanceof GooglePullSyncError ? error.safeError : null,
    });
    return googleJsonResponse(
      {
        success: false,
        stage: error instanceof GooglePullSyncError ? error.stage : "unknown",
        error: error instanceof GooglePullSyncError && error.safeError ? error.safeError : { message },
        message,
      },
      { status: 500 },
    );
  }
}
