import {
  fetchGoogleCalendarList,
  getFreshGoogleAccessToken,
  getOwnedGoogleAccount,
  getServiceSupabaseClient,
  googleCorsHeaders,
  googleJsonResponse,
  requireAuthenticatedUser,
  type StoredGoogleAccount,
} from "../_shared";

export const runtime = "nodejs";

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: googleCorsHeaders,
  });
}

function toSafeAccount(account: StoredGoogleAccount) {
  return {
    id: account.id,
    providerType: account.provider_type,
    email: account.provider_account_email ?? account.provider_email,
    displayName: account.display_name,
    connectionStatus: account.connection_status,
    syncCapability: account.sync_capability,
    lastSyncAt: account.last_sync_at,
    lastError: account.last_error,
  };
}

function isGoogleCalendarWritable(accessRole?: string) {
  return accessRole === "owner" || accessRole === "writer";
}

async function listGoogleCalendars(request: Request) {
  try {
    console.info("Google calendars list route reached");
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const supabase = getServiceSupabaseClient();
    const { data: accounts, error: accountsError } = await supabase
      .from("external_calendar_accounts")
      .select("*")
      .eq("user_id", authResult.user.id)
      .eq("provider_type", "google")
      .order("created_at", { ascending: true });

    if (accountsError) throw accountsError;
    console.info("Google calendars account query complete", {
      userId: authResult.user.id,
      accountCount: accounts?.length ?? 0,
      connectedCount: (accounts ?? []).filter((account) => account.connection_status === "connected").length,
    });

    const { data: enabledCalendars, error: calendarsError } = await supabase
      .from("external_calendars")
      .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color")
      .eq("provider_type", "google")
      .eq("created_by_profile_id", authResult.user.id);

    if (calendarsError) throw calendarsError;

    const enabledByProviderId = new Map(
      (enabledCalendars ?? [])
        .filter((calendar) => calendar.provider_account_id && calendar.provider_calendar_id)
        .map((calendar) => [`${calendar.provider_account_id}:${calendar.provider_calendar_id}`, calendar]),
    );

    const calendarsByAccountId: Record<string, Array<{
      providerCalendarId: string;
      summary: string;
      primary: boolean;
      accessRole: string | null;
      writable: boolean;
      enabled: boolean;
      externalCalendarId: string | null;
      color: string | null;
      visibility: string | null;
    }>> = {};

    for (const account of accounts ?? []) {
      if (account.connection_status !== "connected") {
        console.info("Google calendars skipping non-connected account", {
          accountId: account.id,
          connectionStatus: account.connection_status,
        });
        calendarsByAccountId[account.id] = [];
        continue;
      }

      try {
        const accessToken = await getFreshGoogleAccessToken(supabase, account);
        const googleCalendars = await fetchGoogleCalendarList(accessToken);
        console.info("Google calendars loaded for account", {
          accountId: account.id,
          calendarCount: googleCalendars.length,
        });
        calendarsByAccountId[account.id] = googleCalendars.map((calendar) => {
          const enabledCalendar = enabledByProviderId.get(`${account.id}:${calendar.id}`);
          return {
            providerCalendarId: calendar.id,
            summary: calendar.summary,
            primary: Boolean(calendar.primary),
            accessRole: calendar.accessRole ?? null,
            writable: isGoogleCalendarWritable(calendar.accessRole),
            enabled: Boolean(enabledCalendar?.sync_enabled),
            externalCalendarId: enabledCalendar?.id ?? null,
            color: enabledCalendar?.color ?? calendar.backgroundColor ?? null,
            visibility: enabledCalendar?.visibility ?? "private",
          };
        });
      } catch (calendarError) {
        const message = calendarError instanceof Error ? calendarError.message : "Impossible de charger les calendriers Google.";
        console.error("Google calendars fetch failed for account", {
          accountId: account.id,
          message,
        });
        await supabase
          .from("external_calendar_accounts")
          .update({
            connection_status: "error",
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);
        calendarsByAccountId[account.id] = [];
      }
    }

    return googleJsonResponse({
      accounts: (accounts ?? []).map(toSafeAccount),
      calendarsByAccountId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de charger les calendriers Google.";
    console.error("Google calendars list route failed", { message });
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    console.info("Google calendars POST reached");
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as {
      action?: "list" | "set_enabled";
      accountId?: string;
      providerCalendarId?: string;
      name?: string;
      color?: string | null;
      visibility?: string | null;
      enabled?: boolean;
    } | null;

    if (!body || body.action === "list") {
      return listGoogleCalendars(request);
    }

    const accountId = body?.accountId?.trim();
    const providerCalendarId = body?.providerCalendarId?.trim();
    if (!accountId || !providerCalendarId) {
      return googleJsonResponse({ error: "Calendrier Google manquant." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const account = await getOwnedGoogleAccount(supabase, accountId, authResult.user.id);

    if (!body?.enabled) {
      const { error } = await supabase
        .from("external_calendars")
        .update({
          sync_enabled: false,
          last_sync_status: "idle",
        })
        .eq("provider_account_id", account.id)
        .eq("provider_calendar_id", providerCalendarId)
        .eq("created_by_profile_id", authResult.user.id);

      if (error) throw error;
      return googleJsonResponse({ ok: true, enabled: false });
    }

    const now = new Date().toISOString();
    const visibility = body.visibility === "admin_only" || body.visibility === "team" ? body.visibility : "private";
    const { data, error } = await supabase
      .from("external_calendars")
      .upsert(
        {
          name: body.name?.trim() || "Google Calendar",
          ics_url: "",
          color: body.color ?? "blue",
          visibility,
          provider_type: "google",
          provider_account_id: account.id,
          provider_calendar_id: providerCalendarId,
          sync_capability: "bidirectional",
          sync_enabled: true,
          last_sync_status: "idle",
          last_sync_error: null,
          created_by_profile_id: authResult.user.id,
          created_by_name: account.display_name ?? account.provider_account_email ?? account.provider_email,
          created_at: now,
        },
        { onConflict: "provider_account_id,provider_calendar_id" },
      )
      .select()
      .single();

    if (error) throw error;
    return googleJsonResponse({ ok: true, enabled: true, calendarId: data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de modifier ce calendrier Google.";
    console.error("Google calendars POST failed", { message });
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}
