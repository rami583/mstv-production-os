import {
  decryptSecret,
  getOwnedGoogleAccount,
  getServiceSupabaseClient,
  googleCorsHeaders,
  googleJsonResponse,
  requireAuthenticatedUser,
  revokeGoogleToken,
} from "../_shared";

export const runtime = "nodejs";

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: googleCorsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => null)) as { accountId?: string } | null;
    const accountId = body?.accountId?.trim();
    if (!accountId) {
      return googleJsonResponse({ error: "Compte Google manquant." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const account = await getOwnedGoogleAccount(supabase, accountId, authResult.user.id);
    const refreshToken = account.refresh_token_encrypted ? decryptSecret(account.refresh_token_encrypted) : null;
    if (refreshToken) {
      await revokeGoogleToken(refreshToken);
    }

    const { error } = await supabase
      .from("external_calendar_accounts")
      .update({
        connection_status: "disconnected",
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        credential_payload_encrypted: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    if (error) throw error;
    return googleJsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de déconnecter Google Calendar.";
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}
