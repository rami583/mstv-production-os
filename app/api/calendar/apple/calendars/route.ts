import {
  appleCorsHeaders,
  appleJsonResponse,
  cleanupAppleCalendarDuplicates,
  decryptAppleCredentials,
  getServiceSupabaseClient,
  listAppleCalDavCalendars,
  materializeAppleCalendars,
  normalizeCalDavCalendarKey,
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
  if (input.calendarId) {
    const { data, error } = await supabase
      .from("external_calendars")
      .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color, calendar_role")
      .eq("id", input.calendarId)
      .eq("provider_account_id", input.accountId)
      .eq("provider_type", "apple_caldav")
      .eq("created_by_profile_id", input.userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("external_calendars")
    .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color, calendar_role")
    .eq("provider_account_id", input.accountId)
    .eq("provider_type", "apple_caldav")
    .eq("created_by_profile_id", input.userId);

  if (candidatesError) throw candidatesError;
  const providerCalendarKey = normalizeCalDavCalendarKey(input.providerCalendarId);
  return (candidates ?? []).find((calendar) => normalizeCalDavCalendarKey(calendar.provider_calendar_id) === providerCalendarKey) ?? null;
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

async function getMatchingStoredAppleCalendarIds(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  input: { accountId: string; providerCalendarId: string; userId: string; primaryCalendarId?: string | null },
) {
  const { data, error } = await supabase
    .from("external_calendars")
    .select("id, provider_calendar_id")
    .eq("provider_account_id", input.accountId)
    .eq("provider_type", "apple_caldav")
    .eq("created_by_profile_id", input.userId);

  if (error) throw error;
  const providerCalendarKey = normalizeCalDavCalendarKey(input.providerCalendarId);
  const ids = (data ?? [])
    .filter((calendar) => normalizeCalDavCalendarKey(calendar.provider_calendar_id) === providerCalendarKey)
    .map((calendar) => calendar.id);
  if (input.primaryCalendarId && !ids.includes(input.primaryCalendarId)) ids.unshift(input.primaryCalendarId);
  return Array.from(new Set(ids));
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as {
      action?: "list" | "update_settings" | "remove" | "cleanup_duplicates";
      accountId?: string;
      calendarId?: string;
      providerCalendarId?: string;
      color?: string | null;
      visibility?: string | null;
      enabled?: boolean;
    } | null;

    const supabase = getServiceSupabaseClient();

    if (body?.action === "cleanup_duplicates") {
      const { data: accounts, error: accountsError } = await supabase
        .from("external_calendar_accounts")
        .select("*")
        .eq("user_id", authResult.user.id)
        .eq("provider_type", "apple_caldav")
        .order("created_at", { ascending: true });

      if (accountsError) throw accountsError;

      let duplicatesDisabled = 0;
      let canonicalRowsUpdated = 0;
      let duplicateGroupCount = 0;

      for (const account of accounts ?? []) {
        let calendars: Array<{ providerCalendarId: string; name: string; color: string | null }> = [];
        if (account.connection_status === "connected") {
          try {
            const credentials = decryptAppleCredentials(account);
            calendars = await listAppleCalDavCalendars(credentials);
            await materializeAppleCalendars(supabase, {
              account,
              userId: authResult.user.id,
              calendars,
            });
          } catch (calendarError) {
            console.warn("Apple cleanup could not refresh CalDAV listing; falling back to local rows.", {
              accountId: account.id,
              message: calendarError instanceof Error ? calendarError.message : String(calendarError),
            });
          }
        }

        const cleanupResult = await cleanupAppleCalendarDuplicates(supabase, {
          account,
          userId: authResult.user.id,
          calendars,
        });
        duplicatesDisabled += cleanupResult.duplicatesDisabled;
        canonicalRowsUpdated += cleanupResult.canonicalRowsUpdated;
        duplicateGroupCount += cleanupResult.duplicateGroups.length;
      }

      return appleJsonResponse({
        ok: true,
        duplicatesDisabled,
        canonicalRowsUpdated,
        duplicateGroupCount,
      });
    }

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

      if (body.action === "remove") {
        const matchingCalendarIds = await getMatchingStoredAppleCalendarIds(supabase, {
          accountId,
          providerCalendarId: calendar.provider_calendar_id ?? providerCalendarId,
          userId: authResult.user.id,
          primaryCalendarId: calendar.id,
        });
        const { error } = await supabase
          .from("external_calendars")
          .update({
            sync_enabled: false,
            last_sync_status: "idle",
            last_sync_error: null,
          })
          .in("id", matchingCalendarIds);

        if (error) throw error;
        const refetchedCalendar = await refetchStoredAppleCalendar(supabase, calendar.id);
        console.info("Apple calendar local sync disabled", {
          externalCalendarId: calendar.id,
          matchingCalendarCount: matchingCalendarIds.length,
          syncEnabled: refetchedCalendar.sync_enabled,
        });
        return appleJsonResponse({ ok: true, enabled: false, calendarId: calendar.id, calendar: refetchedCalendar });
      }

      const visibility = body.visibility === "admin_only" || body.visibility === "team" ? body.visibility : "private";
      const matchingCalendarIds = await getMatchingStoredAppleCalendarIds(supabase, {
        accountId,
        providerCalendarId: calendar.provider_calendar_id ?? providerCalendarId,
        userId: authResult.user.id,
        primaryCalendarId: calendar.id,
      });
      const { error } = await supabase
        .from("external_calendars")
        .update({
          color: body.color ?? calendar.color ?? "blue",
          visibility,
          sync_enabled: typeof body.enabled === "boolean" ? body.enabled : calendar.sync_enabled,
          last_sync_error: null,
        })
        .in("id", matchingCalendarIds);

      if (error) throw error;
      const refetchedCalendar = await refetchStoredAppleCalendar(supabase, calendar.id);
      console.info("Apple calendar local settings updated", {
        externalCalendarId: calendar.id,
        matchingCalendarCount: matchingCalendarIds.length,
        syncEnabled: refetchedCalendar.sync_enabled,
        color: refetchedCalendar.color,
      });
      return appleJsonResponse({
        ok: true,
        calendarId: calendar.id,
        enabled: refetchedCalendar.sync_enabled,
        color: refetchedCalendar.color,
        visibility: refetchedCalendar.visibility,
        calendar: refetchedCalendar,
      });
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
      .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color, calendar_role")
      .eq("provider_type", "apple_caldav")
      .eq("created_by_profile_id", authResult.user.id);

    if (storedCalendarsError) throw storedCalendarsError;

    const storedByProviderId = new Map(
      (storedCalendars ?? [])
        .filter((calendar) => calendar.provider_account_id && calendar.provider_calendar_id)
        .map((calendar) => [`${calendar.provider_account_id}:${normalizeCalDavCalendarKey(calendar.provider_calendar_id)}`, calendar]),
    );

    const calendarsByAccountId: Record<string, AppleCalDavCalendar[]> = {};
    const safeAccounts = [...(accounts ?? [])];

    for (const account of safeAccounts) {
      if (account.connection_status === "disconnected") {
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
        await supabase
          .from("external_calendar_accounts")
          .update({
            connection_status: "connected",
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);
        account.connection_status = "connected";
        account.last_error = null;

        const { data: refreshedStoredCalendars, error: refreshedStoredCalendarsError } = await supabase
          .from("external_calendars")
          .select("id, provider_account_id, provider_calendar_id, sync_enabled, visibility, color, calendar_role")
          .eq("provider_account_id", account.id)
          .eq("provider_type", "apple_caldav")
          .eq("created_by_profile_id", authResult.user.id);

        if (refreshedStoredCalendarsError) throw refreshedStoredCalendarsError;
        for (const storedCalendar of refreshedStoredCalendars ?? []) {
          if (storedCalendar.provider_account_id && storedCalendar.provider_calendar_id) {
            storedByProviderId.set(`${storedCalendar.provider_account_id}:${normalizeCalDavCalendarKey(storedCalendar.provider_calendar_id)}`, storedCalendar);
          }
        }

        calendarsByAccountId[account.id] = calendars.map((calendar) => {
          const stored = storedByProviderId.get(`${account.id}:${normalizeCalDavCalendarKey(calendar.providerCalendarId)}`);
          return {
            providerCalendarId: calendar.providerCalendarId,
            name: calendar.name,
            color: stored?.color ?? calendar.color ?? null,
            enabled: Boolean(stored?.sync_enabled ?? true),
            externalCalendarId: stored?.id ?? null,
            visibility: stored?.visibility ?? "private",
            calendarRole: stored?.calendar_role ?? (calendar.name === "Mon Studio TV" ? "business_primary" : "external_context"),
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
      accounts: safeAccounts.map(toSafeAppleAccount),
      calendarsByAccountId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de charger Apple Calendar.";
    console.error("Apple calendars list route failed", { message });
    return appleJsonResponse({ error: message }, { status: 500 });
  }
}
