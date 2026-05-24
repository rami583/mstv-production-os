import {
  AppleCalDavStageError,
  appleCorsHeaders,
  appleJsonResponse,
  encryptAppleCredentials,
  getServiceSupabaseClient,
  listAppleCalDavCalendars,
  materializeAppleCalendars,
  requireAuthenticatedUser,
  toSafeAppleAccount,
} from "../_shared";

export const runtime = "nodejs";

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: appleCorsHeaders,
  });
}

function normalizeAppleEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeAppleAppPassword(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "");
}

type AppleConnectStage =
  | "auth"
  | "validation"
  | "caldav_discovery"
  | "caldav_principal"
  | "caldav_calendar_home"
  | "caldav_calendars"
  | "supabase_account_lookup"
  | "supabase_account_update"
  | "supabase_account_insert"
  | "supabase_calendars_materialize"
  | "unknown";

function appleConnectErrorResponse(input: {
  stage: AppleConnectStage | string;
  message: string;
  status?: number;
  details?: string | null;
}) {
  return appleJsonResponse(
    {
      error: input.message,
      message: input.message,
      stage: input.stage,
      status: input.status ?? 500,
      details: input.details ?? null,
    },
    { status: input.status ?? 500 },
  );
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) {
      return appleConnectErrorResponse({
        stage: "auth",
        message: "Session utilisateur introuvable. Reconnectez-vous.",
        status: authResult.error?.status ?? 401,
      });
    }

    const body = (await request.json().catch(() => null)) as { appleId?: string; appPassword?: string } | null;
    const appleId = normalizeAppleEmail(body?.appleId ?? "");
    const appPassword = normalizeAppleAppPassword(body?.appPassword ?? "");

    if (!appleId || !appPassword) {
      return appleConnectErrorResponse({
        stage: "validation",
        message: "Adresse Apple et mot de passe d’app obligatoires.",
        status: 400,
      });
    }

    let calendars: Awaited<ReturnType<typeof listAppleCalDavCalendars>>;
    try {
      calendars = await listAppleCalDavCalendars({
        appleId,
        appPassword,
        serverUrl: "https://caldav.icloud.com",
      });
    } catch (error) {
      if (error instanceof AppleCalDavStageError) {
        const isInvalidAppleCredentials = error.status === 401;
        return appleConnectErrorResponse({
          stage: error.stage,
          message: isInvalidAppleCredentials
            ? "Identifiants Apple Calendar incorrects. Vérifiez l’adresse iCloud et le mot de passe d’app Apple."
            : error.message,
          status: isInvalidAppleCredentials ? 401 : 502,
          details: error.status ? `${error.status} ${error.statusText ?? ""}`.trim() : error.details,
        });
      }
      throw Object.assign(error instanceof Error ? error : new Error("Découverte Apple Calendar impossible."), {
        appleConnectStage: "caldav_discovery",
      });
    }

    const supabase = getServiceSupabaseClient();
    const encryptedCredentials = encryptAppleCredentials({ appleId, appPassword });
    const now = new Date().toISOString();

    const { data: existingAccount, error: existingError } = await supabase
      .from("external_calendar_accounts")
      .select("*")
      .eq("user_id", authResult.user.id)
      .eq("provider_type", "apple_caldav")
      .eq("provider_account_id", appleId)
      .maybeSingle();

    if (existingError) {
      return appleConnectErrorResponse({
        stage: "supabase_account_lookup",
        message: "Impossible de vérifier le compte Apple Calendar.",
        status: 500,
        details: existingError.message,
      });
    }

    let account = existingAccount;
    if (account) {
      const { data, error } = await supabase
        .from("external_calendar_accounts")
        .update({
          provider_email: appleId,
          provider_account_email: appleId,
          display_name: appleId,
          credential_payload_encrypted: encryptedCredentials,
          connection_status: "connected",
          sync_capability: "read_only",
          last_error: null,
          updated_at: now,
        })
        .eq("id", account.id)
        .select("*")
        .single();

      if (error) {
        return appleConnectErrorResponse({
          stage: "supabase_account_update",
          message: "Impossible de mettre à jour le compte Apple Calendar.",
          status: 500,
          details: error.message,
        });
      }
      account = data;
    } else {
      const { data, error } = await supabase
        .from("external_calendar_accounts")
        .insert({
          user_id: authResult.user.id,
          provider_type: "apple_caldav",
          provider_account_id: appleId,
          provider_email: appleId,
          provider_account_email: appleId,
          display_name: appleId,
          scopes: ["caldav"],
          credential_payload_encrypted: encryptedCredentials,
          connection_status: "connected",
          sync_capability: "read_only",
          last_error: null,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (error) {
        return appleConnectErrorResponse({
          stage: "supabase_account_insert",
          message: "Impossible d’enregistrer le compte Apple Calendar.",
          status: 500,
          details: error.message,
        });
      }
      account = data;
    }

    try {
      await materializeAppleCalendars(supabase, {
        account,
        userId: authResult.user.id,
        calendars,
      });
    } catch (error) {
      return appleConnectErrorResponse({
        stage: "supabase_calendars_materialize",
        message: "Compte Apple connecté, mais impossible d’enregistrer ses calendriers.",
        status: 500,
        details: error instanceof Error ? error.message : null,
      });
    }

    return appleJsonResponse({
      account: toSafeAppleAccount(account),
      calendarCount: calendars.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion Apple Calendar impossible.";
    const stage = typeof error === "object" && error !== null && "appleConnectStage" in error
      ? String((error as { appleConnectStage?: unknown }).appleConnectStage)
      : "unknown";
    console.error("Apple Calendar connect failed", { message, stage });
    return appleConnectErrorResponse({ stage, message, status: 500 });
  }
}
