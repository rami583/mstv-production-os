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

class GooglePullSyncError extends Error {
  kind: SyncFailureKind;

  constructor(kind: SyncFailureKind, message: string) {
    super(message);
    this.name = "GooglePullSyncError";
    this.kind = kind;
  }
}

type GoogleEvent = {
  id: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
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

async function fetchGoogleEvents(accessToken: string, providerCalendarId: string) {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setFullYear(timeMin.getFullYear() - 1);
  const timeMax = new Date(now);
  timeMax.setFullYear(timeMax.getFullYear() + 2);

  do {
    const url = new URL(`${googleCalendarApiBaseUrl}/calendars/${encodeURIComponent(providerCalendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("orderBy", "startTime");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as { items?: GoogleEvent[]; nextPageToken?: string; error?: { message?: string } } | null;
    console.info("Google pull sync API page response", {
      status: response.status,
      ok: response.ok,
      itemCount: payload?.items?.length ?? 0,
      hasNextPage: Boolean(payload?.nextPageToken),
    });

    if (!response.ok) {
      throw new GooglePullSyncError("google_api", payload?.error?.message || "Impossible de lire ce calendrier Google.");
    }

    events.push(...(payload?.items ?? []));
    pageToken = payload?.nextPageToken;
  } while (pageToken);

  console.info("Google pull sync events fetched", {
    providerCalendarIdPresent: Boolean(providerCalendarId),
    eventCount: events.length,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  });
  return events;
}

function getSafeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
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
  console.error("Google pull sync Supabase step failed", {
    step,
    ...safeError,
  });
  throw new GooglePullSyncError(kind, "Google a été lu, mais MSTV n’a pas pu enregistrer les événements.");
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

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { externalCalendarId?: string } | null;
    const externalCalendarId = body?.externalCalendarId?.trim();
    console.info("Google pull sync route reached", {
      externalCalendarIdPresent: Boolean(externalCalendarId),
    });
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
    console.info("Google pull sync calendar loaded", {
      externalCalendarId: calendar.id,
      providerType: calendar.provider_type,
      syncCapability: calendar.sync_capability,
      syncEnabled: calendar.sync_enabled,
      providerCalendarIdPresent: Boolean(calendar.provider_calendar_id),
    });

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
      console.info("Google pull sync account loaded", {
        accountId: account.id,
        encryptedTokenFound: Boolean(account.refresh_token_encrypted),
      });
      accessToken = await getFreshGoogleAccessToken(supabase, account);
    } catch (authError) {
      console.error("Google pull sync auth/token step failed", {
        message: getErrorMessage(authError),
      });
      throw new GooglePullSyncError("google_auth", "Autorisation Google expirée. Reconnectez Google Calendar.");
    }
    const googleEvents = await fetchGoogleEvents(accessToken, calendar.provider_calendar_id);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let conflicts = 0;

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
        console.info("Google pull sync creating missing MSTV event", {
          externalCalendarId: calendar.id,
          googleEventIdPresent: Boolean(googleEvent.id),
          googleEventUpdatedAt: providerUpdatedAt,
        });
        const { data: insertedEvent, error: insertError } = await supabase
          .from("events")
          .insert(values)
          .select()
          .single();

        if (insertError) throwSupabaseSyncError("supabase_write", "insert_mstv_event_from_google", insertError);

        const now = new Date().toISOString();
        const { error: linkInsertError } = await supabase.from("external_event_links").insert({
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
        });
        if (linkInsertError) throwSupabaseSyncError("supabase_write", "insert_external_event_link", linkInsertError);
        console.info("Google pull sync created MSTV event and link", {
          eventId: insertedEvent.id,
          externalCalendarId: calendar.id,
          googleEventIdPresent: Boolean(googleEvent.id),
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
      const providerChanged = providerUpdatedAt > lastSyncedAt;
      const localChanged = localEvent.updated_at > lastSyncedAt;

      if (providerChanged && localChanged) {
        console.info("Google pull sync conflict detected", {
          eventId: localEvent.id,
          linkId: existingLink.id,
          providerUpdatedAt,
          localUpdatedAt: localEvent.updated_at,
          lastSyncedAt,
        });
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
        console.info("Google pull sync updating MSTV event from Google", {
          eventId: localEvent.id,
          linkId: existingLink.id,
          providerUpdatedAt,
          lastSyncedAt,
        });
        const { data: updatedEvent, error: updateError } = await supabase
          .from("events")
          .update(values)
          .eq("id", localEvent.id)
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
          .eq("id", existingLink.id);
        if (linkUpdateError) throwSupabaseSyncError("supabase_write", "update_external_event_link_after_pull", linkUpdateError);
        console.info("Google pull sync updated MSTV event and link", {
          eventId: updatedEvent.id,
          linkId: existingLink.id,
        });
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

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

    console.info("Google pull sync completed", {
      externalCalendarId: calendar.id,
      total: googleEvents.length,
      created,
      updated,
      unchanged,
      conflicts,
    });
    return googleJsonResponse({
      synced: googleEvents.length,
      total: googleEvents.length,
      created,
      updated,
      unchanged,
      conflicts,
    });
  } catch (error) {
    const message = getUserMessageForSyncError(error);
    console.error("Google calendar pull sync failed", {
      message,
      technicalMessage: getErrorMessage(error),
      kind: error instanceof GooglePullSyncError ? error.kind : "unknown",
    });
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}
