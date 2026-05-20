import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

export const googleCalendarScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export const googleOAuthAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
export const googleOAuthTokenUrl = "https://oauth2.googleapis.com/token";
export const googleOAuthRevokeUrl = "https://oauth2.googleapis.com/revoke";
export const googleUserInfoUrl = "https://openidconnect.googleapis.com/v1/userinfo";
export const googleCalendarApiBaseUrl = "https://www.googleapis.com/calendar/v3";

export const googleCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

export function googleJsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      ...googleCorsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

export function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Configuration serveur incomplète : identifiants Google manquants.");
  }

  return { clientId, clientSecret, redirectUri };
}

function getEncryptionKey() {
  const rawKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("Configuration serveur incomplète : clé de chiffrement manquante.");
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  try {
    const base64Key = Buffer.from(rawKey, "base64");
    if (base64Key.length === 32) return base64Key;
  } catch {
    // Fall through to utf8 handling.
  }

  const utf8Key = Buffer.from(rawKey, "utf8");
  if (utf8Key.length === 32) return utf8Key;

  return crypto.createHash("sha256").update(utf8Key).digest();
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | null) {
  if (!value) {
    console.error("Google token decrypt failed", { reason: "missing_token" });
    throw new Error("Compte Google incomplet : jeton absent.");
  }
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    console.error("Google token decrypt failed", { reason: "invalid_format", version });
    throw new Error("Compte Google incomplet : jeton invalide.");
  }

  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
    console.info("Google token decrypt success");
    return decrypted;
  } catch (error) {
    console.error("Google token decrypt failed", {
      reason: "decrypt_error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function signOAuthState(input: { userId: string; issuedAt: number; nonce: string }) {
  const payload = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getEncryptionKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("État OAuth invalide.");
  const expectedSignature = crypto.createHmac("sha256", getEncryptionKey()).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("État OAuth invalide.");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; issuedAt?: number; nonce?: string };
  if (!parsed.userId || !parsed.issuedAt || !parsed.nonce) throw new Error("État OAuth invalide.");
  if (Date.now() - parsed.issuedAt > 10 * 60 * 1000) throw new Error("Connexion Google expirée. Réessayez.");
  return { userId: parsed.userId, issuedAt: parsed.issuedAt, nonce: parsed.nonce };
}

export function getServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Configuration serveur incomplète : accès Supabase serveur manquant.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getUserSupabaseClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Configuration Supabase manquante.");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function requireAuthenticatedUser(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return { error: googleJsonResponse({ error: "Votre session a expiré. Veuillez vous reconnecter." }, { status: 401 }) };
  }

  const supabase = getUserSupabaseClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return { error: googleJsonResponse({ error: "Votre session a expiré. Veuillez vous reconnecter." }, { status: 401 }) };
  }

  return { user: data.user };
}

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const response = await fetch(googleOAuthTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || "Connexion Google impossible.");
  }
  return payload;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const response = await fetch(googleOAuthTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || "Connexion Google à renouveler.");
  }
  return payload;
}

export type StoredGoogleAccount = Database["public"]["Tables"]["external_calendar_accounts"]["Row"];

export async function getOwnedGoogleAccount(supabase: SupabaseClient<Database>, accountId: string, userId: string) {
  const { data: account, error } = await supabase
    .from("external_calendar_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("provider_type", "google")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!account) throw new Error("Compte Google introuvable.");
  return account;
}

export async function getFreshGoogleAccessToken(supabase: SupabaseClient<Database>, account: StoredGoogleAccount) {
  const refreshToken = decryptSecret(account.refresh_token_encrypted);
  const tokenPayload = await refreshGoogleAccessToken(refreshToken);
  const tokenExpiresAt = tokenPayload.expires_in ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString() : null;

  await supabase
    .from("external_calendar_accounts")
    .update({
      token_expires_at: tokenExpiresAt,
      connection_status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  console.info("Google access token refreshed", {
    accountId: account.id,
    tokenExpiresAt,
  });

  return tokenPayload.access_token as string;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(googleUserInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as { email?: string; name?: string; sub?: string } | null;
}

export async function fetchGoogleCalendarList(accessToken: string) {
  const calendars: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    accessRole?: string;
    backgroundColor?: string;
  }> = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${googleCalendarApiBaseUrl}/users/me/calendarList`);
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as { items?: typeof calendars; nextPageToken?: string; error?: { message?: string } } | null;
    console.info("Google calendar API list response", {
      status: response.status,
      ok: response.ok,
      itemCount: payload?.items?.length ?? 0,
      hasNextPage: Boolean(payload?.nextPageToken),
    });
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Impossible de charger les calendriers Google.");
    }

    calendars.push(...(payload?.items ?? []));
    pageToken = payload?.nextPageToken;
  } while (pageToken);

  return calendars;
}

export async function revokeGoogleToken(token: string) {
  await fetch(googleOAuthRevokeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }),
  }).catch(() => null);
}
