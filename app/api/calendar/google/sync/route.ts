import {
  getFreshGoogleAccessToken,
  getOwnedGoogleAccount,
  getServiceSupabaseClient,
  googleCalendarApiBaseUrl,
  googleCorsHeaders,
  googleJsonResponse,
  requireAuthenticatedUser,
} from "../_shared";

export const runtime = "nodejs";

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
        const { data: insertedEvent, error: insertError } = await supabase
          .from("events")
          .insert(values)
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
        const { error: linkInsertError } = await supabase.from("external_event_links").insert(linkInsertPayload);
        if (linkInsertError) throwSupabaseSyncError("supabase_write", "insert_external_event_link", linkInsertError);
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
      const providerChanged = providerUpdatedAt > lastSyncedAt;
      const localChanged = localEvent.updated_at > lastSyncedAt;

      if (providerChanged && localChanged) {
        const { error: conflictError } = await supabase
          .from("external_event_links")
          .update({
            sync_status: "conflict",
            conflict_detected_at: new Date().toISOString(),
            conflict_reason: "Conflit de synchronisation détecté. Vérifiez l’événement avant de continuer.",
            last_external_updated_at: providerUpdatedAt,
            raw_external_event: googleEvent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLink.id);
        if (conflictError) throwSupabaseSyncError("supabase_write", "mark_external_event_link_conflict", conflictError);
        conflicts += 1;
        continue;
      }

      if (providerChanged) {
        const { data: updatedEvent, error: updateError } = await supabase
          .from("events")
          .update(values)
          .eq("id", localEvent.id)
          .select()
          .single();
        if (updateError) throwSupabaseSyncError("supabase_write", "update_mstv_event_from_google", updateError);

        const now = new Date().toISOString();
        const linkUpdatePayload = {
            sync_status: "synced",
            local_updated_at: updatedEvent.updated_at,
            last_synced_at: now,
            last_external_updated_at: providerUpdatedAt,
            conflict_detected_at: null,
            conflict_reason: null,
            last_sync_error: null,
            raw_external_event: googleEvent,
            updated_at: now,
          };
        const { error: linkUpdateError } = await supabase
          .from("external_event_links")
          .update(linkUpdatePayload)
          .eq("id", existingLink.id);
        if (linkUpdateError) throwSupabaseSyncError("supabase_write", "update_external_event_link_after_pull", linkUpdateError);
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
