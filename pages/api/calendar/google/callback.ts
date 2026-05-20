import type { NextApiRequest, NextApiResponse } from "next";
import {
  encryptSecret,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getServiceSupabaseClient,
  googleCalendarScopes,
  verifyOAuthState,
} from "../../../../app/api/calendar/google/_shared";

function getRedirectUrl(status: "connected" | "error", message?: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.GOOGLE_REDIRECT_URI?.replace(/\/api\/calendar\/google\/callback.*$/i, "") || "/";
  const redirectUrl = new URL(siteUrl);
  redirectUrl.searchParams.set("calendarGoogle", status);
  if (message) redirectUrl.searchParams.set("message", message);
  return redirectUrl.toString();
}

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Méthode non autorisée." });
    return;
  }

  const code = typeof request.query.code === "string" ? request.query.code : null;
  const state = typeof request.query.state === "string" ? request.query.state : null;
  const oauthError = typeof request.query.error === "string" ? request.query.error : null;

  if (oauthError) {
    response.redirect(302, getRedirectUrl("error", "Connexion Google annulée."));
    return;
  }

  if (!code || !state) {
    response.redirect(302, getRedirectUrl("error", "Réponse Google incomplète."));
    return;
  }

  try {
    const statePayload = verifyOAuthState(state);
    const tokenPayload = await exchangeGoogleCode(code);
    if (!tokenPayload.refresh_token) {
      throw new Error("Google n'a pas renvoyé de jeton de synchronisation. Réessayez en validant le consentement.");
    }

    const userInfo = await fetchGoogleUserInfo(tokenPayload.access_token as string);
    const providerAccountId = userInfo?.sub ?? userInfo?.email ?? null;
    const providerEmail = userInfo?.email ?? null;
    const displayName = userInfo?.name ?? providerEmail ?? "Compte Google";
    const tokenExpiresAt = tokenPayload.expires_in ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString() : null;
    const now = new Date().toISOString();
    const supabase = getServiceSupabaseClient();

    const { error } = await supabase
      .from("external_calendar_accounts")
      .upsert(
        {
          user_id: statePayload.userId,
          provider_type: "google",
          provider_account_id: providerAccountId,
          provider_account_email: providerEmail,
          provider_email: providerEmail,
          display_name: displayName,
          scopes: tokenPayload.scope?.split(/\s+/).filter(Boolean) ?? googleCalendarScopes,
          sync_capability: "bidirectional",
          refresh_token_encrypted: encryptSecret(tokenPayload.refresh_token),
          access_token_encrypted: tokenPayload.access_token ? encryptSecret(tokenPayload.access_token) : null,
          token_expires_at: tokenExpiresAt,
          connection_status: "connected",
          last_error: null,
          updated_at: now,
        },
        { onConflict: "user_id,provider_type,provider_account_id" },
      );

    if (error) throw error;
    response.redirect(302, getRedirectUrl("connected"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion Google impossible.";
    console.error("Google OAuth callback failed", { message });
    response.redirect(302, getRedirectUrl("error", message));
  }
}
