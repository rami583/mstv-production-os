import {
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

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { appleId?: string; appPassword?: string } | null;
    const appleId = normalizeAppleEmail(body?.appleId ?? "");
    const appPassword = body?.appPassword?.trim() ?? "";

    if (!appleId || !appPassword) {
      return appleJsonResponse({ error: "Adresse Apple et mot de passe d’app obligatoires." }, { status: 400 });
    }

    const calendars = await listAppleCalDavCalendars({
      appleId,
      appPassword,
      serverUrl: "https://caldav.icloud.com",
    });

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

    if (existingError) throw existingError;

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

      if (error) throw error;
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

      if (error) throw error;
      account = data;
    }

    await materializeAppleCalendars(supabase, {
      account,
      userId: authResult.user.id,
      calendars,
    });

    return appleJsonResponse({
      account: toSafeAppleAccount(account),
      calendarCount: calendars.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion Apple Calendar impossible.";
    console.error("Apple Calendar connect failed", { message });
    return appleJsonResponse({ error: message }, { status: 500 });
  }
}
