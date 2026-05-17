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
      return jsonResponse({ error: "Non authentifié." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { calendarId?: string } | null;
    const calendarId = body?.calendarId?.trim();
    if (!calendarId) {
      return jsonResponse({ error: "Calendrier externe manquant." }, { status: 400 });
    }

    const supabase = getSupabaseClient(accessToken);
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Session invalide." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: calendar, error: calendarError } = await supabase
      .from("external_calendars")
      .select("id, name, ics_url, created_by_profile_id")
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

    const icsUrl = calendar.ics_url.trim();
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

    const response = await fetch(parsedUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/calendar,text/plain,*/*",
        "User-Agent": "MSTV Production OS Calendar Sync",
      },
    });

    if (!response.ok) {
      console.error("External ICS fetch failed", {
        calendarId: calendar.id,
        calendarName: calendar.name,
        status: response.status,
        statusText: response.statusText,
      });
      return jsonResponse({ error: "Impossible de récupérer le flux ICS." }, { status: 502 });
    }

    const icsText = await response.text();
    if (!icsText.trim()) {
      return jsonResponse({ error: "Le flux ICS est vide." }, { status: 502 });
    }

    return jsonResponse({ icsText });
  } catch (error) {
    console.error("External ICS API error", error);
    return jsonResponse({ error: "Impossible de récupérer le flux ICS." }, { status: 500 });
  }
}
