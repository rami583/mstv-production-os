import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function getSupabaseClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Configuration Supabase manquante.");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function normalizeIcsUrl(value: string) {
  const trimmed = value.trim();
  if (/^webcal:\/\//i.test(trimmed)) {
    return `https://${trimmed.replace(/^webcal:\/\//i, "")}`;
  }
  return trimmed;
}

function getUrlProtocol(value: string) {
  try {
    return new URL(value).protocol.replace(/:$/, "") || "unknown";
  } catch {
    return "invalid";
  }
}

function getSafeResponsePreview(value: string) {
  return value
    .slice(0, 100)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\r?\n/g, "\\n");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return jsonResponse({ error: "Votre session a expiré. Veuillez vous reconnecter." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { calendarId?: string } | null;
    const calendarId = body?.calendarId?.trim();
    if (!calendarId) {
      return jsonResponse({ error: "Calendrier externe manquant." }, { status: 400 });
    }

    const supabase = getSupabaseClient(accessToken);
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Votre session a expiré. Veuillez vous reconnecter." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: calendar, error: calendarError } = await supabase
      .from("external_calendars")
      .select("id, name, ics_url, provider_type, sync_capability, created_by_profile_id")
      .eq("id", calendarId)
      .maybeSingle();

    if (calendarError) throw calendarError;
    if (!calendar) {
      return jsonResponse({ error: "Calendrier introuvable." }, { status: 404 });
    }

    const isAdmin = profile?.role === "admin";
    const isOwner = calendar.created_by_profile_id === userData.user.id;
    if (!isAdmin && !isOwner) {
      return jsonResponse({ error: "Accès refusé." }, { status: 403 });
    }

    if (calendar.provider_type !== "ics_read_only" || calendar.sync_capability !== "read_only") {
      return jsonResponse({ error: "Ce calendrier utilise une synchronisation connectée." }, { status: 400 });
    }

    const rawIcsUrl = calendar.ics_url?.trim() ?? "";
    const icsUrl = normalizeIcsUrl(rawIcsUrl);
    if (!icsUrl) {
      return jsonResponse({ error: "URL ICS manquante." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(icsUrl);
    } catch {
      return jsonResponse({ error: "URL ICS invalide." }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return jsonResponse({ error: "URL ICS invalide." }, { status: 400 });
    }

    console.info("External ICS fetch start", {
      calendarId: calendar.id,
      calendarName: calendar.name,
      receivedProtocol: getUrlProtocol(rawIcsUrl),
      normalizedProtocol: parsedUrl.protocol.replace(/:$/, ""),
      normalizedHost: parsedUrl.host,
    });

    let response: Response;
    try {
      response = await fetch(parsedUrl, {
        cache: "no-store",
        redirect: "follow",
        headers: {
          Accept: "text/calendar,text/plain,application/octet-stream,*/*",
          "User-Agent": "MSTV Production OS/1.0 Calendar Sync",
        },
      });
    } catch (fetchError) {
      console.error("External ICS fetch network failed", {
        calendarId: calendar.id,
        calendarName: calendar.name,
        normalizedHost: parsedUrl.host,
        error: getErrorMessage(fetchError),
      });
      return jsonResponse({ error: "Flux calendrier inaccessible." }, { status: 502 });
    }

    if (!response.ok) {
      console.error("External ICS fetch failed", {
        calendarId: calendar.id,
        calendarName: calendar.name,
        normalizedHost: parsedUrl.host,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      });
      return jsonResponse({ error: "Flux calendrier inaccessible." }, { status: 502 });
    }

    const icsText = await response.text();
    const responseSize = Buffer.byteLength(icsText, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const looksLikeIcs = /BEGIN:VCALENDAR/i.test(icsText);

    console.info("External ICS fetch response", {
      calendarId: calendar.id,
      calendarName: calendar.name,
      normalizedHost: parsedUrl.host,
      status: response.status,
      contentType,
      responseSize,
      preview: getSafeResponsePreview(icsText),
      containsVCalendar: looksLikeIcs,
      containsVEvent: /BEGIN:VEVENT/i.test(icsText),
    });

    if (!icsText.trim() || !looksLikeIcs) {
      console.error("External ICS validation failed", {
        calendarId: calendar.id,
        calendarName: calendar.name,
        normalizedHost: parsedUrl.host,
        contentType,
        responseSize,
        preview: getSafeResponsePreview(icsText),
      });
      return jsonResponse({ error: "Le lien ne semble pas être un calendrier ICS valide." }, { status: 422 });
    }

    return jsonResponse({ icsText });
  } catch (error) {
    console.error("External ICS API error", error);
    return jsonResponse({ error: "Impossible de récupérer le flux ICS." }, { status: 500 });
  }
}
