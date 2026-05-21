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

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const supabase = getServiceSupabaseClient();
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
