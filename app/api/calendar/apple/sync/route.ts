import type { Database } from "@/lib/supabase";
import {
  appleCorsHeaders,
  appleJsonResponse,
  calDavReport,
  decryptAppleCredentials,
  getFirstXmlTagValue,
  getOwnedAppleAccount,
  getServiceSupabaseClient,
  getXmlResponses,
  joinCalDavUrl,
  requireAuthenticatedUser,
  xmlDecode,
} from "../_shared";

export const runtime = "nodejs";

type ProductionEventInsert = Database["public"]["Tables"]["events"]["Insert"];
type ExternalCalendarRow = Database["public"]["Tables"]["external_calendars"]["Row"];

type AppleCalDavEvent = {
  externalEventId: string;
  uid: string | null;
  recurrenceId: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  providerUpdatedAt: string;
  etag: string | null;
  href: string | null;
  rawEvent: Record<string, unknown>;
};

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: appleCorsHeaders,
  });
}

function getAppleSyncWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 6);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 18);
  return { start, end };
}

function toCalDavDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function unescapeIcsValue(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function unfoldIcsLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function parseIcsProperty(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) return null;
  const rawName = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [name = "", ...paramParts] = rawName.split(";");
  const params = Object.fromEntries(
    paramParts.map((part) => {
      const [key = "", rawValue = ""] = part.split("=");
      return [key.toLocaleUpperCase("fr-FR"), rawValue.replace(/^"|"$/g, "")];
    }),
  );

  return {
    name: name.toLocaleUpperCase("fr-FR"),
    params,
    value,
  };
}

function parseIcsDate(value: string, params: Record<string, string>) {
  const isAllDay = params.VALUE?.toLocaleUpperCase("fr-FR") === "DATE" || /^\d{8}$/.test(value);
  const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (isAllDay && dateMatch) {
    const [, year, month, day] = dateMatch;
    return {
      iso: `${year}-${month}-${day}T12:00:00.000Z`,
      allDay: true,
    };
  }

  const dateTimeMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTimeMatch) return null;

  const [, year, month, day, hours, minutes, seconds = "00", utcFlag] = dateTimeMatch;
  const parsedDate = utcFlag
    ? new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`)
    : new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));

  if (Number.isNaN(parsedDate.getTime())) return null;
  return {
    iso: parsedDate.toISOString(),
    allDay: false,
  };
}

function hashFallback(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `generated-${Math.abs(hash)}`;
}

function parseAppleDateToIso(value: string | null) {
  if (!value) return null;
  const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${year}-${month}-${day}T12:00:00.000Z`;
  }
  const dateTimeMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTimeMatch) return null;
  const [, year, month, day, hours, minutes, seconds = "00", utcFlag] = dateTimeMatch;
  const parsedDate = utcFlag
    ? new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`)
    : new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function parseAppleVEvents(icsText: string, metadata: { etag: string | null; href: string | null }) {
  const lines = unfoldIcsLines(icsText);
  const events: AppleCalDavEvent[] = [];
  let currentLines: string[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentLines = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (currentLines) {
        const raw: Record<string, unknown> = {};
        let uid = "";
        let recurrenceId = "";
        let summary = "";
        let description: string | null = null;
        let location: string | null = null;
        let startTime = "";
        let endTime: string | null = null;
        let allDay = false;
        let lastModified: string | null = null;
        let dtStamp: string | null = null;

        for (const eventLine of currentLines) {
          const property = parseIcsProperty(eventLine);
          if (!property) continue;
          raw[property.name] = property.value;

          if (property.name === "UID") uid = property.value.trim();
          if (property.name === "RECURRENCE-ID") recurrenceId = property.value.trim();
          if (property.name === "SUMMARY") summary = unescapeIcsValue(property.value);
          if (property.name === "DESCRIPTION") description = unescapeIcsValue(property.value);
          if (property.name === "LOCATION") location = unescapeIcsValue(property.value);
          if (property.name === "LAST-MODIFIED") lastModified = property.value.trim();
          if (property.name === "DTSTAMP") dtStamp = property.value.trim();
          if (property.name === "DTSTART") {
            const parsedDate = parseIcsDate(property.value.trim(), property.params);
            if (parsedDate) {
              startTime = parsedDate.iso;
              allDay = parsedDate.allDay;
            }
          }
          if (property.name === "DTEND") {
            const parsedDate = parseIcsDate(property.value.trim(), property.params);
            if (parsedDate) {
              endTime = parsedDate.iso;
            }
          }
        }

        if (startTime && summary) {
          const externalEventId = uid
            ? recurrenceId
              ? `${uid}::${recurrenceId}`
              : uid
            : hashFallback(`${summary}-${startTime}-${endTime ?? ""}-${metadata.href ?? ""}`);
          const providerUpdatedAt = parseAppleDateToIso(lastModified) ?? parseAppleDateToIso(dtStamp) ?? new Date().toISOString();

          events.push({
            externalEventId,
            uid: uid || null,
            recurrenceId: recurrenceId || null,
            summary,
            description,
            location,
            startTime,
            endTime,
            allDay,
            providerUpdatedAt,
            etag: metadata.etag,
            href: metadata.href,
            rawEvent: {
              ...raw,
              href: metadata.href,
              etag: metadata.etag,
            },
          });
        }
      }

      currentLines = null;
      continue;
    }

    if (currentLines) currentLines.push(line);
  }

  return events;
}

function parseAppleSummary(summary?: string) {
  const cleanSummary = summary?.trim() || "Apple Calendar";
  const separators = [" - ", " – ", " — ", " | ", " : ", " / "];

  for (const separator of separators) {
    const index = cleanSummary.indexOf(separator);
    if (index > 0) {
      const clientName = cleanSummary.slice(0, index).trim();
      const eventName = cleanSummary.slice(index + separator.length).trim();
      if (clientName && eventName) return { clientName, eventName };
    }
  }

  return { clientName: cleanSummary, eventName: "Événement Apple" };
}

function getLocalDateKeyFromIso(isoValue: string) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLocalTimeFromIso(isoValue: string | null, allDay = false) {
  if (!isoValue || allDay) return null;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function mapAppleEventToMstvEvent(event: AppleCalDavEvent): ProductionEventInsert {
  const parsedSummary = parseAppleSummary(event.summary);
  return {
    client_name: parsedSummary.clientName,
    event_name: parsedSummary.eventName,
    date: getLocalDateKeyFromIso(event.startTime),
    client_arrival_time: null,
    start_time: getLocalTimeFromIso(event.startTime, event.allDay),
    end_time: getLocalTimeFromIso(event.endTime, event.allDay),
    end_of_day_time: null,
  };
}

function isAfter(value?: string | null, base?: string | null) {
  if (!value || !base) return Boolean(value && !base);
  const valueTimestamp = Date.parse(value);
  const baseTimestamp = Date.parse(base);
  return Number.isFinite(valueTimestamp) && Number.isFinite(baseTimestamp) && valueTimestamp > baseTimestamp;
}

async function fetchAppleCalendarEvents(input: {
  credentials: ReturnType<typeof decryptAppleCredentials>;
  calendar: ExternalCalendarRow;
  syncWindow: ReturnType<typeof getAppleSyncWindow>;
}) {
  if (!input.calendar.provider_calendar_id) return [];

  const calendarUrl = joinCalDavUrl(input.credentials.serverUrl, input.calendar.provider_calendar_id);
  const xml = await calDavReport({
    url: calendarUrl,
    appleId: input.credentials.appleId,
    appPassword: input.credentials.appPassword,
    depth: "1",
    body: `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavDateTime(input.syncWindow.start)}" end="${toCalDavDateTime(input.syncWindow.end)}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
  });

  return getXmlResponses(xml).flatMap((responseXml) => {
    const href = getFirstXmlTagValue(responseXml, "href");
    const etag = getFirstXmlTagValue(responseXml, "getetag");
    const calendarData = getFirstXmlTagValue(responseXml, "calendar-data");
    if (!calendarData || !/BEGIN:VEVENT/i.test(calendarData)) return [];
    return parseAppleVEvents(xmlDecode(calendarData), { etag, href });
  });
}

function getSafeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error), code: null };
  const maybeError = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    message: typeof maybeError.message === "string" ? maybeError.message : String(error),
    code: typeof maybeError.code === "string" ? maybeError.code : null,
    details: typeof maybeError.details === "string" ? maybeError.details : null,
    hint: typeof maybeError.hint === "string" ? maybeError.hint : null,
  };
}

function throwSupabaseError(step: string, error: unknown): never {
  console.error("Apple pull sync Supabase step failed", {
    step,
    ...getSafeSupabaseError(error),
  });
  throw new Error("Apple Calendar a été lu, mais MSTV n’a pas pu enregistrer les événements.");
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { externalCalendarId?: string } | null;
    const externalCalendarId = body?.externalCalendarId?.trim();
    if (!externalCalendarId) {
      return appleJsonResponse({ error: "Calendrier Apple manquant." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: calendar, error: calendarError } = await supabase
      .from("external_calendars")
      .select("*")
      .eq("id", externalCalendarId)
      .eq("created_by_profile_id", authResult.user.id)
      .eq("provider_type", "apple_caldav")
      .eq("sync_capability", "read_only")
      .maybeSingle();

    if (calendarError) throwSupabaseError("load_external_calendar", calendarError);
    if (!calendar?.provider_account_id || !calendar.provider_calendar_id) {
      return appleJsonResponse({ error: "Calendrier Apple introuvable." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error: startSyncError } = await supabase
      .from("external_calendars")
      .update({
        last_sync_started_at: now,
        last_sync_status: "syncing",
        last_sync_error: null,
      })
      .eq("id", calendar.id);
    if (startSyncError) throwSupabaseError("mark_calendar_syncing", startSyncError);

    const account = await getOwnedAppleAccount(supabase, calendar.provider_account_id, authResult.user.id);
    const credentials = decryptAppleCredentials(account);
    const syncWindow = getAppleSyncWindow();
    const appleEvents = await fetchAppleCalendarEvents({ credentials, calendar, syncWindow });

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const appleEvent of appleEvents) {
      const { data: existingLink, error: linkError } = await supabase
        .from("external_event_links")
        .select("*")
        .eq("external_calendar_id", calendar.id)
        .eq("external_event_id", appleEvent.externalEventId)
        .limit(1)
        .maybeSingle();

      if (linkError) throwSupabaseError("lookup_external_event_link", linkError);

      const values = mapAppleEventToMstvEvent(appleEvent);
      if (!existingLink) {
        const { data: insertedEvent, error: insertError } = await supabase
          .from("events")
          .insert(values)
          .select()
          .single();

        if (insertError) throwSupabaseError("insert_mstv_event_from_apple", insertError);

        const linkPayload = {
          event_id: insertedEvent.id,
          external_calendar_id: calendar.id,
          provider_type: "apple_caldav",
          provider_calendar_id: calendar.provider_calendar_id,
          external_event_id: appleEvent.externalEventId,
          external_event_uid: appleEvent.uid,
          sync_direction: "pull",
          sync_status: "synced",
          local_updated_at: insertedEvent.updated_at,
          last_synced_at: now,
          last_external_updated_at: appleEvent.providerUpdatedAt,
          last_sync_error: null,
          raw_external_event: appleEvent.rawEvent,
        };
        const { error: linkInsertError } = await supabase.from("external_event_links").insert(linkPayload);
        if (linkInsertError) throwSupabaseError("insert_external_event_link", linkInsertError);
        created += 1;
        continue;
      }

      if (!isAfter(appleEvent.providerUpdatedAt, existingLink.last_external_updated_at ?? existingLink.last_synced_at)) {
        unchanged += 1;
        continue;
      }

      const { data: updatedEvent, error: updateError } = await supabase
        .from("events")
        .update(values)
        .eq("id", existingLink.event_id)
        .is("deleted_at", null)
        .select()
        .maybeSingle();

      if (updateError) throwSupabaseError("update_mstv_event_from_apple", updateError);
      if (!updatedEvent) {
        unchanged += 1;
        continue;
      }

      const { error: linkUpdateError } = await supabase
        .from("external_event_links")
        .update({
          sync_status: "synced",
          local_updated_at: updatedEvent.updated_at,
          last_synced_at: new Date().toISOString(),
          last_external_updated_at: appleEvent.providerUpdatedAt,
          last_sync_error: null,
          raw_external_event: appleEvent.rawEvent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLink.id);

      if (linkUpdateError) throwSupabaseError("update_external_event_link_after_pull", linkUpdateError);
      updated += 1;
    }

    const finishedAt = new Date().toISOString();
    const { error: finishSyncError } = await supabase
      .from("external_calendars")
      .update({
        last_sync_finished_at: finishedAt,
        last_sync_status: "synced",
        last_sync_error: null,
      })
      .eq("id", calendar.id);
    if (finishSyncError) throwSupabaseError("mark_calendar_sync_finished", finishSyncError);

    return appleJsonResponse({
      synced: appleEvents.length,
      total: appleEvents.length,
      created,
      updated,
      unchanged,
      conflicts: 0,
      deleted: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de synchroniser Apple Calendar.";
    console.error("Apple calendar pull sync failed", { message });
    return appleJsonResponse({ success: false, message, error: message }, { status: 500 });
  }
}
