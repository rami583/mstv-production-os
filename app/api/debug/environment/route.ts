import { getServiceSupabaseClient, googleCorsHeaders, googleJsonResponse, requireAuthenticatedUser } from "@/app/api/calendar/google/_shared";

export const runtime = "nodejs";

const providerTypes = ["google", "microsoft", "apple_caldav", "ics_read_only"] as const;

function getSupabaseProjectRef(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

async function countTableByProvider(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  tableName: "external_calendar_accounts" | "external_calendars" | "external_event_links",
) {
  const counts: Record<string, number> = {};
  const errors: Record<string, { message: string; code?: string | null; details?: string | null }> = {};

  for (const providerType of providerTypes) {
    const { count, error } = await supabase
      .from(tableName)
      .select("id", { count: "exact", head: true })
      .eq("provider_type", providerType);

    counts[providerType] = count ?? 0;
    if (error) {
      errors[providerType] = {
        message: error.message,
        code: error.code ?? null,
        details: error.details ?? null,
      };
    }
  }

  return { counts, errors };
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: googleCorsHeaders,
  });
}

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedUser(request);
  if ("error" in authResult) return authResult.error;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabase = getServiceSupabaseClient();
    const [accounts, calendars, eventLinks, activeEvents] = await Promise.all([
      countTableByProvider(supabase, "external_calendar_accounts"),
      countTableByProvider(supabase, "external_calendars"),
      countTableByProvider(supabase, "external_event_links"),
      supabase.from("events").select("id", { count: "exact", head: true }).is("deleted_at", null),
    ]);

    return googleJsonResponse({
      nextPublicSupabaseUrl: supabaseUrl ?? null,
      supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
      counts: {
        externalCalendarAccountsByProviderType: accounts.counts,
        externalCalendarsByProviderType: calendars.counts,
        externalEventLinksByProviderType: eventLinks.counts,
        activeEvents: activeEvents.count ?? 0,
      },
      errors: {
        externalCalendarAccountsByProviderType: accounts.errors,
        externalCalendarsByProviderType: calendars.errors,
        externalEventLinksByProviderType: eventLinks.errors,
        activeEvents: activeEvents.error
          ? {
              message: activeEvents.error.message,
              code: activeEvents.error.code ?? null,
              details: activeEvents.error.details ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Environment diagnostic failed", error);
    return googleJsonResponse(
      {
        error: "Impossible de charger le diagnostic environnement.",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
