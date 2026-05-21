import {
  appleCorsHeaders,
  appleJsonResponse,
  decryptAppleCredentials,
  getServiceSupabaseClient,
  listAppleCalDavCalendars,
  materializeAppleCalendars,
  requireAuthenticatedUser,
  toSafeAppleAccount,
  type AppleCalDavCalendar,
} from "../_shared";

export const runtime = "nodejs";

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: appleCorsHeaders,
  });
}

async function findStoredAppleCalendar(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  input: { accountId: string; providerCalendarId: string; userId: string; calendarId?: string | null },
) {
  let query = supabase
    .from("external_calendars")
    .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color")
    .eq("provider_account_id", input.accountId)
    .eq("provider_calendar_id", input.providerCalendarId)
    .eq("provider_type", "apple_caldav")
    .eq("created_by_profile_id", input.userId)
    .limit(1);

  if (input.calendarId) {
    query = query.eq("id", input.calendarId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
}

async function refetchStoredAppleCalendar(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  calendarId: string,
) {
  const { data, error } = await supabase
    .from("external_calendars")
    .select("*")
    .eq("id", calendarId)
    .eq("provider_type", "apple_caldav")
    .single();

  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as {
      action?: "list" | "update_settings" | "remove";
      accountId?: string;
      calendarId?: string;
      providerCalendarId?: string;
      color?: string | null;
      visibility?: string | null;
      enabled?: boolean;
    } | null;

    const supabase = getServiceSupabaseClient();

    if (body?.action === "update_settings" || body?.action === "remove") {
      const accountId = body.accountId?.trim();
      const providerCalendarId = body.providerCalendarId?.trim();
      if (!accountId || !providerCalendarId) {
        return appleJsonResponse({ error: "Calendrier Apple manquant." }, { status: 400 });
      }

      const calendar = await findStoredAppleCalendar(supabase, {
        accountId,
        providerCalendarId,
        userId: authResult.user.id,
        calendarId: body.calendarId?.trim() || null,
      });
      if (!calendar?.id) {
        return appleJsonResponse({ error: "Calendrier Apple introuvable dans MSTV." }, { status: 404 });
      }

      console.info("Apple calendar settings action target", {
        action: body.action,
        requestedCalendarId: body.calendarId ?? null,
        resolvedCalendarId: calendar.id,
        providerCalendarId,
      });

      if (body.action === "remove") {
        const { data, error } = await supabase
          .from("external_calendars")
          .update({
            sync_enabled: false,
            last_sync_status: "idle",
            last_sync_error: null,
          })
          .eq("id", calendar.id)
          .select("id, sync_enabled, color")
          .single();

        if (error) throw error;
        const refetchedCalendar = await refetchStoredAppleCalendar(supabase, data.id);
        console.info("Apple calendar local sync disabled", {
          externalCalendarId: data.id,
          providerCalendarId,
          updateResponse: data,
          refetchedSyncEnabled: refetchedCalendar.sync_enabled,
          refetchedColor: refetchedCalendar.color,
        });
        return appleJsonResponse({ ok: true, enabled: false, calendarId: data.id, calendar: refetchedCalendar });
      }

      const visibility = body.visibility === "admin_only" || body.visibility === "team" ? body.visibility : "private";
      const { data, error } = await supabase
        .from("external_calendars")
        .update({
          color: body.color ?? calendar.color ?? "blue",
          visibility,
          sync_enabled: typeof body.enabled === "boolean" ? body.enabled : calendar.sync_enabled,
          last_sync_error: null,
        })
        .eq("id", calendar.id)
        .select("id, sync_enabled, color, visibility")
        .single();

      if (error) throw error;
      const refetchedCalendar = await refetchStoredAppleCalendar(supabase, data.id);
      console.info("Apple calendar local settings updated", {
        externalCalendarId: data.id,
        providerCalendarId,
        updateResponse: data,
        refetchedSyncEnabled: refetchedCalendar.sync_enabled,
        refetchedColor: refetchedCalendar.color,
      });
      return appleJsonResponse({ ok: true, calendarId: data.id, enabled: data.sync_enabled, color: data.color, visibility: data.visibility, calendar: refetchedCalendar });
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("external_calendar_accounts")
      .select("*")
      .eq("user_id", authResult.user.id)
      .eq("provider_type", "apple_caldav")
      .order("created_at", { ascending: true });

    if (accountsError) throw accountsError;

    const { data: storedCalendars, error: storedCalendarsError } = await supabase
      .from("external_calendars")
      .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color")
      .eq("provider_type", "apple_caldav")
      .eq("created_by_profile_id", authResult.user.id);

    if (storedCalendarsError) throw storedCalendarsError;

    const storedByProviderId = new Map(
      (storedCalendars ?? [])
        .filter((calendar) => calendar.provider_account_id && calendar.provider_calendar_id)
        .map((calendar) => [`${calendar.provider_account_id}:${calendar.provider_calendar_id}`, calendar]),
    );

    const calendarsByAccountId: Record<string, AppleCalDavCalendar[]> = {};

    for (const account of accounts ?? []) {
      if (account.connection_status !== "connected") {
        calendarsByAccountId[account.id] = [];
        continue;
      }

      try {
        const credentials = decryptAppleCredentials(account);
        const calendars = await listAppleCalDavCalendars(credentials);
        await materializeAppleCalendars(supabase, {
          account,
          userId: authResult.user.id,
          calendars,
        });

        const { data: refreshedStoredCalendars, error: refreshedStoredCalendarsError } = await supabase
          .from("external_calendars")
          .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color")
          .eq("provider_account_id", account.id)
          .eq("provider_type", "apple_caldav")
          .eq("created_by_profile_id", authResult.user.id);

        if (refreshedStoredCalendarsError) throw refreshedStoredCalendarsError;
        for (const storedCalendar of refreshedStoredCalendars ?? []) {
          if (storedCalendar.provider_account_id && storedCalendar.provider_calendar_id) {
            storedByProviderId.set(`${storedCalendar.provider_account_id}:${storedCalendar.provider_calendar_id}`, storedCalendar);
          }
        }

        calendarsByAccountId[account.id] = calendars.map((calendar) => {
          const stored = storedByProviderId.get(`${account.id}:${calendar.providerCalendarId}`);
          return {
            providerCalendarId: calendar.providerCalendarId,
            name: calendar.name,
            color: stored?.color ?? calendar.color ?? null,
            enabled: Boolean(stored?.sync_enabled ?? true),
            externalCalendarId: stored?.id ?? null,
            visibility: stored?.visibility ?? "private",
          };
        });
      } catch (calendarError) {
        const message = calendarError instanceof Error ? calendarError.message : "Impossible de charger les calendriers Apple.";
        console.error("Apple calendars fetch failed for account", {
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

    return appleJsonResponse({
      accounts: (accounts ?? []).map(toSafeAppleAccount),
      calendarsByAccountId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de charger Apple Calendar.";
    console.error("Apple calendars list route failed", { message });
    return appleJsonResponse({ error: message }, { status: 500 });
  }
}
