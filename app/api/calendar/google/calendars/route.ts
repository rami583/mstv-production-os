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

async function findStoredGoogleCalendar(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  input: { accountId: string; providerCalendarId: string; userId: string },
) {
  const { data, error } = await supabase
    .from("external_calendars")
    .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color")
    .eq("provider_account_id", input.accountId)
    .eq("provider_calendar_id", input.providerCalendarId)
    .eq("provider_type", "google")
    .eq("created_by_profile_id", input.userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function materializeWritableGoogleCalendar(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  input: {
    account: StoredGoogleAccount;
    userId: string;
    providerCalendarId: string;
    name: string;
    color: string | null;
  },
) {
  const existingCalendar = await findStoredGoogleCalendar(supabase, {
    accountId: input.account.id,
    providerCalendarId: input.providerCalendarId,
    userId: input.userId,
  });

  if (existingCalendar) return existingCalendar;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("external_calendars")
    .insert({
      name: input.name || "Google Calendar",
      ics_url: "",
      color: input.color ?? "blue",
      visibility: "private",
      provider_type: "google",
      provider_account_id: input.account.id,
      provider_calendar_id: input.providerCalendarId,
      sync_capability: "bidirectional",
      sync_enabled: true,
      last_sync_status: "idle",
      last_sync_error: null,
      created_by_profile_id: input.userId,
      created_by_name: input.account.display_name ?? input.account.provider_account_email ?? input.account.provider_email,
      created_at: now,
    })
    .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color")
    .single();

  if (error) throw error;
  console.info("Google writable calendar materialized for event write UI", {
    accountId: input.account.id,
    providerCalendarId: input.providerCalendarId,
    externalCalendarId: data.id,
  });
  return data;
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
        const safeCalendars = [];
        for (const calendar of googleCalendars) {
          const writable = isGoogleCalendarWritable(calendar.accessRole);
          let enabledCalendar = enabledByProviderId.get(`${account.id}:${calendar.id}`);
          if (writable && !enabledCalendar) {
            enabledCalendar = await materializeWritableGoogleCalendar(supabase, {
              account,
              userId: authResult.user.id,
              providerCalendarId: calendar.id,
              name: calendar.summary,
              color: calendar.backgroundColor ?? null,
            });
            enabledByProviderId.set(`${account.id}:${calendar.id}`, enabledCalendar);
          }
          safeCalendars.push({
            providerCalendarId: calendar.id,
            summary: calendar.summary,
            primary: Boolean(calendar.primary),
            accessRole: calendar.accessRole ?? null,
            writable,
            enabled: Boolean(enabledCalendar?.sync_enabled),
            externalCalendarId: enabledCalendar?.id ?? null,
            color: enabledCalendar?.color ?? calendar.backgroundColor ?? null,
            visibility: enabledCalendar?.visibility ?? "private",
          });
        }
        calendarsByAccountId[account.id] = safeCalendars;
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
      action?: "list" | "set_enabled" | "update_settings" | "remove";
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
    const existingCalendar = await findStoredGoogleCalendar(supabase, {
      accountId: account.id,
      providerCalendarId,
      userId: authResult.user.id,
    });

    if (body.action === "remove") {
      if (!existingCalendar?.id) {
        return googleJsonResponse({ ok: true, enabled: false });
      }

      const { data, error } = await supabase
        .from("external_calendars")
        .update({
          sync_enabled: false,
          last_sync_status: "idle",
          last_sync_error: null,
        })
        .eq("id", existingCalendar.id)
        .select("id, sync_enabled, color")
        .single();

      if (error) throw error;
      console.info("Google calendar local sync disabled", {
        externalCalendarId: data.id,
        providerCalendarId,
        syncEnabled: data.sync_enabled,
      });
      return googleJsonResponse({ ok: true, enabled: false, calendarId: data.id });
    }

    if (body.action === "update_settings") {
      if (!existingCalendar?.id) {
        return googleJsonResponse({ error: "Calendrier Google introuvable dans MSTV." }, { status: 404 });
      }

      const visibility = body.visibility === "admin_only" || body.visibility === "team" ? body.visibility : "private";
      const { data, error } = await supabase
        .from("external_calendars")
        .update({
          color: body.color ?? existingCalendar.color ?? "blue",
          visibility,
          sync_enabled: typeof body.enabled === "boolean" ? body.enabled : existingCalendar.sync_enabled,
          last_sync_error: null,
        })
        .eq("id", existingCalendar.id)
        .select("id, sync_enabled, color, visibility")
        .single();

      if (error) throw error;
      console.info("Google calendar local settings updated", {
        externalCalendarId: data.id,
        providerCalendarId,
        syncEnabled: data.sync_enabled,
        color: data.color,
      });
      return googleJsonResponse({ ok: true, calendarId: data.id, enabled: data.sync_enabled, color: data.color, visibility: data.visibility });
    }

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

    const visibility = body.visibility === "admin_only" || body.visibility === "team" ? body.visibility : "private";
    let calendarId: string;
    if (existingCalendar?.id) {
      const { error } = await supabase
        .from("external_calendars")
        .update({
          name: body.name?.trim() || "Google Calendar",
          color: body.color ?? "blue",
          visibility,
          sync_enabled: true,
          sync_capability: "bidirectional",
          last_sync_status: "idle",
          last_sync_error: null,
        })
        .eq("id", existingCalendar.id);

      if (error) throw error;
      calendarId = existingCalendar.id;
    } else {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("external_calendars")
        .insert({
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
        })
        .select("id")
        .single();

      if (error) throw error;
      calendarId = data.id;
    }

    return googleJsonResponse({ ok: true, enabled: true, calendarId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de modifier ce calendrier Google.";
    console.error("Google calendars POST failed", { message });
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}
