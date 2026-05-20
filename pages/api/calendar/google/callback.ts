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

  console.info("Google OAuth callback reached", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasOAuthError: Boolean(oauthError),
  });

  if (oauthError) {
    console.warn("Google OAuth callback returned OAuth error", { error: oauthError });
    response.redirect(302, getRedirectUrl("error", "Connexion Google annulée."));
    return;
  }

  if (!code || !state) {
    console.warn("Google OAuth callback missing code or state", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    response.redirect(302, getRedirectUrl("error", "Réponse Google incomplète."));
    return;
  }

  try {
    const statePayload = verifyOAuthState(state);
    console.info("Google OAuth callback state decoded", {
      userId: statePayload.userId,
      issuedAt: statePayload.issuedAt,
    });
    const tokenPayload = await exchangeGoogleCode(code);
    console.info("Google OAuth token exchange result", {
      accessTokenPresent: Boolean(tokenPayload.access_token),
      refreshTokenPresent: Boolean(tokenPayload.refresh_token),
      expiresInPresent: Boolean(tokenPayload.expires_in),
      scopeCount: tokenPayload.scope?.split(/\s+/).filter(Boolean).length ?? 0,
    });
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

    if (!providerAccountId) {
      throw new Error("Compte Google incomplet : identifiant introuvable.");
    }

    console.info("Google OAuth user info fetched", {
      userId: statePayload.userId,
      providerAccountIdPresent: Boolean(providerAccountId),
      providerEmailPresent: Boolean(providerEmail),
      providerEmail,
    });

    console.info("Google OAuth account save started", {
      userId: statePayload.userId,
      providerAccountIdPresent: Boolean(providerAccountId),
      providerEmailPresent: Boolean(providerEmail),
    });

    const accountPayload = {
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
    };

    const { data: existingAccount, error: selectError } = await supabase
      .from("external_calendar_accounts")
      .select("id")
      .eq("user_id", statePayload.userId)
      .eq("provider_type", "google")
      .eq("provider_account_id", providerAccountId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.error("Google OAuth account lookup failed", {
        message: selectError.message,
        code: selectError.code,
        details: selectError.details,
        hint: selectError.hint,
      });
      throw selectError;
    }

    if (existingAccount?.id) {
      const { error: updateError } = await supabase
        .from("external_calendar_accounts")
        .update(accountPayload)
        .eq("id", existingAccount.id);

      if (updateError) {
        console.error("Google OAuth account update failed", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        });
        throw updateError;
      }

      console.info("Google OAuth account update success", {
        userId: statePayload.userId,
        accountId: existingAccount.id,
      });
    } else {
      const { error: insertError } = await supabase
        .from("external_calendar_accounts")
        .insert({
          ...accountPayload,
          user_id: statePayload.userId,
          provider_type: "google",
          provider_account_id: providerAccountId,
          created_at: now,
        });

      if (insertError) {
        console.error("Google OAuth account insert failed", {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });
        throw insertError;
      }

      console.info("Google OAuth account insert success", {
        userId: statePayload.userId,
        providerAccountIdPresent: Boolean(providerAccountId),
      });
    }

    console.info("Google OAuth account save success", {
      userId: statePayload.userId,
      providerAccountIdPresent: Boolean(providerAccountId),
      providerEmailPresent: Boolean(providerEmail),
    });
    response.redirect(302, getRedirectUrl("connected"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion Google impossible.";
    console.error("Google OAuth callback failed", { message });
    response.redirect(302, getRedirectUrl("error", message));
  }
}
