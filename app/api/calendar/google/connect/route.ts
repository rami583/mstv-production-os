import crypto from "node:crypto";
import {
  getGoogleOAuthConfig,
  googleCalendarScopes,
  googleCorsHeaders,
  googleJsonResponse,
  googleOAuthAuthorizeUrl,
  requireAuthenticatedUser,
  signOAuthState,
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
    console.info("Google OAuth connect reached");
    const authResult = await requireAuthenticatedUser(request);
    if ("error" in authResult) return authResult.error;

    const { clientId, redirectUri } = getGoogleOAuthConfig();
    const state = signOAuthState({
      userId: authResult.user.id,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(16).toString("base64url"),
    });

    const authUrl = new URL(googleOAuthAuthorizeUrl);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", googleCalendarScopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    console.info("Google OAuth connect auth URL created", {
      userId: authResult.user.id,
      redirectHost: new URL(redirectUri).host,
      scopeCount: googleCalendarScopes.length,
    });

    return googleJsonResponse({ authUrl: authUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion Google impossible.";
    console.error("Google OAuth connect failed", { message });
    return googleJsonResponse({ error: message }, { status: 500 });
  }
}
