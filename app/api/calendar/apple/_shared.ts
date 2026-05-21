import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  decryptSecret,
  encryptSecret,
  getServiceSupabaseClient,
  googleCorsHeaders,
  googleJsonResponse,
  requireAuthenticatedUser,
} from "../google/_shared";

export const appleCalDavBaseUrl = "https://caldav.icloud.com";

export const appleCorsHeaders = googleCorsHeaders;
export const appleJsonResponse = googleJsonResponse;

export type StoredAppleAccount = Database["public"]["Tables"]["external_calendar_accounts"]["Row"];

type AppleCredentialPayload = {
  appleId: string;
  appPassword: string;
  serverUrl: string;
};

export type AppleCalDavCalendar = {
  providerCalendarId: string;
  name: string;
  color: string | null;
  enabled: boolean;
  externalCalendarId: string | null;
  visibility: string | null;
};

function normalizeAppleEmail(value: string) {
  return value.trim().toLowerCase();
}

export function xmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function getFirstXmlTagValue(xml: string, localName: string) {
  const match = xml.match(new RegExp(`<[^>]*:?${localName}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${localName}>`, "i"));
  return match?.[1] ? xmlDecode(match[1].trim()) : null;
}

function getFirstXmlTagBody(xml: string, localName: string) {
  const match = xml.match(new RegExp(`<[^>]*:?${localName}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${localName}>`, "i"));
  return match?.[1] ?? null;
}

function getHrefInsideTag(xml: string, localName: string) {
  const body = getFirstXmlTagBody(xml, localName);
  if (!body) return null;
  return getFirstXmlTagValue(body, "href");
}

export function getXmlResponses(xml: string) {
  return Array.from(xml.matchAll(/<[^>]*:?response[^>]*>([\s\S]*?)<\/[^>]*:?response>/gi)).map((match) => match[1] ?? "");
}

export function joinCalDavUrl(baseUrl: string, pathOrUrl: string) {
  return new URL(pathOrUrl, baseUrl).toString();
}

export function normalizeCalDavCalendarKey(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    try {
      return new URL(trimmed, appleCalDavBaseUrl).pathname.replace(/\/+$/, "");
    } catch {
      return trimmed.replace(/\/+$/, "");
    }
  }
  return trimmed.replace(/\/+$/, "");
}

function getBasicAuthHeader(appleId: string, appPassword: string) {
  return `Basic ${Buffer.from(`${appleId}:${appPassword}`, "utf8").toString("base64")}`;
}

async function calDavPropfind(input: { url: string; appleId: string; appPassword: string; body: string; depth?: "0" | "1" }) {
  const response = await fetch(input.url, {
    method: "PROPFIND",
    headers: {
      Authorization: getBasicAuthHeader(input.appleId, input.appPassword),
      Depth: input.depth ?? "0",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: input.body,
  });
  const text = await response.text().catch(() => "");

  if (!response.ok) {
    console.error("Apple CalDAV PROPFIND failed", {
      status: response.status,
      host: new URL(input.url).host,
    });
    throw new Error(response.status === 401 ? "Identifiants Apple Calendar incorrects." : "Impossible de charger Apple Calendar.");
  }

  return text;
}

export async function calDavReport(input: { url: string; appleId: string; appPassword: string; body: string; depth?: "0" | "1" }) {
  const response = await fetch(input.url, {
    method: "REPORT",
    headers: {
      Authorization: getBasicAuthHeader(input.appleId, input.appPassword),
      Depth: input.depth ?? "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: input.body,
  });
  const text = await response.text().catch(() => "");

  if (!response.ok) {
    console.error("Apple CalDAV REPORT failed", {
      status: response.status,
      host: new URL(input.url).host,
    });
    throw new Error(response.status === 401 ? "Identifiants Apple Calendar incorrects." : "Impossible de lire Apple Calendar.");
  }

  return text;
}

async function discoverCalendarHome(input: { appleId: string; appPassword: string; serverUrl: string }) {
  const principalXml = await calDavPropfind({
    url: input.serverUrl,
    appleId: input.appleId,
    appPassword: input.appPassword,
    body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal /></d:prop>
</d:propfind>`,
  });
  const principalHref = getHrefInsideTag(principalXml, "current-user-principal");
  if (!principalHref) throw new Error("Compte Apple Calendar introuvable.");

  const homeXml = await calDavPropfind({
    url: joinCalDavUrl(input.serverUrl, principalHref),
    appleId: input.appleId,
    appPassword: input.appPassword,
    body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set /></d:prop>
</d:propfind>`,
  });
  const homeHref = getHrefInsideTag(homeXml, "calendar-home-set");
  if (!homeHref) throw new Error("Aucun calendrier Apple trouvé.");

  return joinCalDavUrl(input.serverUrl, homeHref);
}

export async function listAppleCalDavCalendars(credentials: AppleCredentialPayload) {
  const calendarHomeUrl = await discoverCalendarHome(credentials);
  const calendarsXml = await calDavPropfind({
    url: calendarHomeUrl,
    appleId: credentials.appleId,
    appPassword: credentials.appPassword,
    depth: "1",
    body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:resourcetype />
    <d:displayname />
    <cs:getctag />
    <c:calendar-color />
  </d:prop>
</d:propfind>`,
  });

  return getXmlResponses(calendarsXml)
    .map((responseXml) => {
      const href = getFirstXmlTagValue(responseXml, "href");
      const resourceType = getFirstXmlTagValue(responseXml, "resourcetype") ?? responseXml;
      const name = getFirstXmlTagValue(responseXml, "displayname");
      if (!href || !name || !/calendar/i.test(resourceType)) return null;
      const color = getFirstXmlTagValue(responseXml, "calendar-color");
      return {
        providerCalendarId: href,
        name,
        color,
      };
    })
    .filter((calendar): calendar is { providerCalendarId: string; name: string; color: string | null } => Boolean(calendar));
}

export function encryptAppleCredentials(input: { appleId: string; appPassword: string }) {
  const payload: AppleCredentialPayload = {
    appleId: normalizeAppleEmail(input.appleId),
    appPassword: input.appPassword,
    serverUrl: appleCalDavBaseUrl,
  };
  return encryptSecret(JSON.stringify(payload));
}

export function decryptAppleCredentials(account: StoredAppleAccount) {
  const decrypted = decryptSecret(account.credential_payload_encrypted);
  const payload = JSON.parse(decrypted) as Partial<AppleCredentialPayload>;
  if (!payload.appleId || !payload.appPassword) {
    throw new Error("Compte Apple Calendar incomplet.");
  }
  return {
    appleId: payload.appleId,
    appPassword: payload.appPassword,
    serverUrl: payload.serverUrl || appleCalDavBaseUrl,
  };
}

export async function getOwnedAppleAccount(supabase: SupabaseClient<Database>, accountId: string, userId: string) {
  const { data: account, error } = await supabase
    .from("external_calendar_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("provider_type", "apple_caldav")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!account) throw new Error("Compte Apple Calendar introuvable.");
  return account;
}

export async function materializeAppleCalendars(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  input: {
    account: StoredAppleAccount;
    userId: string;
    calendars: Array<{ providerCalendarId: string; name: string; color: string | null }>;
  },
) {
  const { data: existingCalendars, error: existingError } = await supabase
    .from("external_calendars")
    .select("id, name, provider_account_id, provider_calendar_id, sync_enabled, visibility, color, created_at")
    .eq("provider_account_id", input.account.id)
    .eq("provider_type", "apple_caldav")
    .eq("created_by_profile_id", input.userId);

  if (existingError) throw existingError;

  const existingByProviderId = new Map<string, NonNullable<typeof existingCalendars>[number][]>();
  for (const calendar of existingCalendars ?? []) {
    const key = normalizeCalDavCalendarKey(calendar.provider_calendar_id);
    existingByProviderId.set(key, [...(existingByProviderId.get(key) ?? []), calendar]);
  }
  const now = new Date().toISOString();

  for (const calendar of input.calendars) {
    const providerKey = normalizeCalDavCalendarKey(calendar.providerCalendarId);
    const existingGroup = existingByProviderId.get(providerKey) ?? [];
    if (existingGroup.length > 0) {
      const exactCalendar = existingGroup.find((item) => item.provider_calendar_id === calendar.providerCalendarId);
      const existingCalendar = exactCalendar
        ?? existingGroup.find((item) => item.sync_enabled)
        ?? existingGroup[0];
      const duplicateIds = existingGroup.filter((item) => item.id !== existingCalendar.id).map((item) => item.id);
      const groupWasDisabled = existingGroup.some((item) => !item.sync_enabled);
      if (duplicateIds.length > 0) {
        const { error } = await supabase
          .from("external_calendars")
          .update({
            sync_enabled: false,
            last_sync_status: "idle",
            last_sync_error: null,
          })
          .in("id", duplicateIds);
        if (error) throw error;
        console.info("Apple duplicate calendar rows disabled", {
          accountId: input.account.id,
          canonicalCalendarId: existingCalendar.id,
          disabledDuplicateCount: duplicateIds.length,
        });
      }
      if (existingCalendar.provider_calendar_id !== calendar.providerCalendarId || existingCalendar.name !== calendar.name || groupWasDisabled) {
        const { error } = await supabase
          .from("external_calendars")
          .update({
            name: calendar.name || existingCalendar.name,
            provider_calendar_id: calendar.providerCalendarId,
            sync_enabled: groupWasDisabled ? false : existingCalendar.sync_enabled,
            last_sync_error: null,
          })
          .eq("id", existingCalendar.id);
        if (error) throw error;
      }
      continue;
    }

    const { error } = await supabase.from("external_calendars").insert({
      name: calendar.name || "Apple Calendar",
      ics_url: "",
      color: calendar.color ?? "blue",
      visibility: "private",
      provider_type: "apple_caldav",
      provider_account_id: input.account.id,
      provider_calendar_id: calendar.providerCalendarId,
      sync_capability: "read_only",
      sync_enabled: true,
      last_sync_status: "idle",
      last_sync_error: null,
      created_by_profile_id: input.userId,
      created_by_name: input.account.display_name ?? input.account.provider_account_email ?? input.account.provider_email,
      created_at: now,
    });

    if (error) throw error;
  }
}

export function toSafeAppleAccount(account: StoredAppleAccount) {
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

export { getServiceSupabaseClient, requireAuthenticatedUser };
