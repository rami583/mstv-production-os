import type { Database } from "@/lib/supabase";
import {
  appleCorsHeaders,
  appleJsonResponse,
  cleanupAppleCalendarDuplicates,
  getServiceSupabaseClient,
  isDirectionCalendarName,
  normalizeAppleCalendarNameKey,
  normalizeCalDavCalendarKey,
  requireAuthenticatedUser,
} from "../_shared";

export const runtime = "nodejs";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ExternalCalendarRow = Database["public"]["Tables"]["external_calendars"]["Row"];
type ExternalEventLinkRow = Database["public"]["Tables"]["external_event_links"]["Row"];
type ExternalCalendarAccountRow = Database["public"]["Tables"]["external_calendar_accounts"]["Row"];

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: appleCorsHeaders,
  });
}

function isDirectionText(value: string | null | undefined) {
  return normalizeAppleCalendarNameKey(value).includes("direction");
}

function getProviderKey(calendar: Pick<ExternalCalendarRow, "provider_account_id" | "provider_calendar_id" | "provider_type"> | null | undefined) {
  if (!calendar?.provider_account_id || !calendar.provider_calendar_id) return null;
  return `${calendar.provider_type}:${calendar.provider_account_id}:${normalizeCalDavCalendarKey(calendar.provider_calendar_id)}`;
}

function shouldTreatAsAppleImportedOrphan(event: EventRow, links: ExternalEventLinkRow[]) {
  if (links.length > 0) return false;
  if (event.deleted_at) return false;
  const clientLooksDirection = isDirectionText(event.client_name);
  const eventLooksAppleFallback = normalizeAppleCalendarNameKey(event.event_name) === "evenement apple";
  return clientLooksDirection && eventLooksAppleFallback;
}

async function fetchDirectionEvents(supabase: ReturnType<typeof getServiceSupabaseClient>, linkedEventIds: string[]) {
  const eventsById = new Map<string, EventRow>();

  if (linkedEventIds.length > 0) {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .in("id", Array.from(new Set(linkedEventIds)));
    if (error) throw error;
    for (const event of data ?? []) eventsById.set(event.id, event);
  }

  const { data: textMatches, error: textMatchError } = await supabase
    .from("events")
    .select("*")
    .or("client_name.ilike.%Direction%,event_name.ilike.%Direction%")
    .limit(300);

  if (textMatchError) throw textMatchError;
  for (const event of textMatches ?? []) eventsById.set(event.id, event);

  return Array.from(eventsById.values());
}

function buildVisibilityReason(input: {
  event: EventRow;
  links: ExternalEventLinkRow[];
  calendarsById: Map<string, ExternalCalendarRow>;
  calendarProviderStateByKey: Map<string, boolean>;
}) {
  if (input.event.deleted_at) return { visible: false, reason: "event_deleted_at" };
  if (input.links.length === 0) return { visible: true, reason: "native_or_orphan_no_external_link" };

  for (const link of input.links) {
    const calendar = input.calendarsById.get(link.external_calendar_id) ?? null;
    if (link.deleted_locally_at) return { visible: false, reason: "link_deleted_locally" };
    if (!calendar) return { visible: false, reason: "linked_calendar_missing" };
    if (!calendar.sync_enabled) return { visible: false, reason: "linked_calendar_disabled" };
    const providerKey = getProviderKey(calendar);
    if (providerKey && input.calendarProviderStateByKey.get(providerKey) === false) {
      return { visible: false, reason: "provider_duplicate_group_disabled" };
    }
  }

  return { visible: true, reason: "linked_calendar_enabled" };
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { cleanup?: boolean } | null;
    const shouldCleanup = body?.cleanup !== false;
    const supabase = getServiceSupabaseClient();

    const { data: accounts, error: accountsError } = await supabase
      .from("external_calendar_accounts")
      .select("*")
      .eq("user_id", authResult.user.id)
      .eq("provider_type", "apple_caldav");
    if (accountsError) throw accountsError;

    const cleanupResults = [];
    if (shouldCleanup) {
      for (const account of (accounts ?? []) as ExternalCalendarAccountRow[]) {
        cleanupResults.push(await cleanupAppleCalendarDuplicates(supabase, {
          account,
          userId: authResult.user.id,
        }));
      }
    }

    const { data: appleCalendars, error: calendarsError } = await supabase
      .from("external_calendars")
      .select("*")
      .eq("provider_type", "apple_caldav")
      .eq("created_by_profile_id", authResult.user.id);
    if (calendarsError) throw calendarsError;

    const calendars = (appleCalendars ?? []) as ExternalCalendarRow[];
    const directionCalendars = calendars.filter((calendar) => isDirectionCalendarName(calendar.name));
    const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
    const calendarProviderStateByKey = new Map<string, boolean>();
    for (const calendar of calendars) {
      const providerKey = getProviderKey(calendar);
      if (!providerKey) continue;
      calendarProviderStateByKey.set(providerKey, (calendarProviderStateByKey.get(providerKey) ?? true) && calendar.sync_enabled);
    }

    const { data: appleLinks, error: linksError } = await supabase
      .from("external_event_links")
      .select("*")
      .eq("provider_type", "apple_caldav");
    if (linksError) throw linksError;

    const links = ((appleLinks ?? []) as ExternalEventLinkRow[])
      .filter((link) => calendarsById.has(link.external_calendar_id) || directionCalendars.some((calendar) => calendar.id === link.external_calendar_id));
    const linkedEventIds = links.map((link) => link.event_id);
    const events = await fetchDirectionEvents(supabase, linkedEventIds);
    const linksByEventId = new Map<string, ExternalEventLinkRow[]>();
    for (const link of links) {
      linksByEventId.set(link.event_id, [...(linksByEventId.get(link.event_id) ?? []), link]);
    }

    const matchingEvents = events.filter((event) => {
      const eventLinks = linksByEventId.get(event.id) ?? [];
      const linkedDirectionCalendar = eventLinks.some((link) => isDirectionCalendarName(calendarsById.get(link.external_calendar_id)?.name));
      return isDirectionText(event.client_name)
        || isDirectionText(event.event_name)
        || linkedDirectionCalendar;
    });

    const staleLinkedEventIds = new Set<string>();
    const orphanedAppleEventIds = new Set<string>();
    const diagnostics = matchingEvents.map((event) => {
      const eventLinks = linksByEventId.get(event.id) ?? [];
      const visibility = buildVisibilityReason({
        event,
        links: eventLinks,
        calendarsById,
        calendarProviderStateByKey,
      });

      if (
        shouldCleanup &&
        visibility.visible &&
        eventLinks.some((link) => {
          const calendar = calendarsById.get(link.external_calendar_id);
          if (!calendar) return true;
          const providerKey = getProviderKey(calendar);
          return !calendar.sync_enabled || (providerKey ? calendarProviderStateByKey.get(providerKey) === false : false);
        })
      ) {
        staleLinkedEventIds.add(event.id);
      }

      if (shouldCleanup && shouldTreatAsAppleImportedOrphan(event, eventLinks)) {
        orphanedAppleEventIds.add(event.id);
      }

      return {
        eventId: event.id,
        title: `${event.client_name} — ${event.event_name}`,
        clientName: event.client_name,
        eventName: event.event_name,
        date: event.date,
        startTime: event.start_time,
        endTime: event.end_time,
        deletedAt: event.deleted_at,
        importedFrom: event.imported_from,
        externalImportId: event.external_import_id,
        visible: visibility.visible,
        visibilityReason: visibility.reason,
        externalLinks: eventLinks.map((link) => {
          const calendar = calendarsById.get(link.external_calendar_id) ?? null;
          return {
            linkId: link.id,
            externalCalendarId: link.external_calendar_id,
            providerType: link.provider_type,
            providerCalendarId: link.provider_calendar_id,
            externalEventId: link.external_event_id,
            deletedLocallyAt: link.deleted_locally_at,
            deletedExternallyAt: link.deleted_externally_at,
            calendarName: calendar?.name ?? null,
            calendarProviderType: calendar?.provider_type ?? null,
            calendarProviderCalendarId: calendar?.provider_calendar_id ?? null,
            calendarSyncEnabled: calendar?.sync_enabled ?? null,
            calendarColor: calendar?.color ?? null,
          };
        }),
      };
    });

    const eventIdsToHide = Array.from(new Set([...staleLinkedEventIds, ...orphanedAppleEventIds]));
    if (shouldCleanup && eventIdsToHide.length > 0) {
      const now = new Date().toISOString();
      const { error: hideError } = await supabase
        .from("events")
        .update({
          deleted_at: now,
          deleted_by: "Nettoyage Apple Calendar",
        })
        .in("id", eventIdsToHide);
      if (hideError) throw hideError;
    }

    return appleJsonResponse({
      ok: true,
      cleanupApplied: shouldCleanup,
      accounts: accounts?.length ?? 0,
      directionCalendars: directionCalendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        providerCalendarId: calendar.provider_calendar_id,
        normalizedProviderCalendarId: normalizeCalDavCalendarKey(calendar.provider_calendar_id),
        syncEnabled: calendar.sync_enabled,
        color: calendar.color,
      })),
      cleanupResults,
      hiddenEventIds: eventIdsToHide,
      events: diagnostics.slice(0, 120),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diagnostic Apple Direction impossible.";
    console.error("Apple Direction diagnostic failed", { message });
    return appleJsonResponse({ ok: false, error: message }, { status: 500 });
  }
}
