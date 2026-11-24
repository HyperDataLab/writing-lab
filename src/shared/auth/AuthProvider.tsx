"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext } from "./authContext";
import { SSO_BASE_URL, SSO_CALLBACK_URL, SSO_CLIENT_ID, isAllowedOrganizationEmail } from "./config";
import { clearHandoffFromUrl, parseHandoff, requestResearchHubSession, requestResearchHubTokenRefresh } from "./researchHubHandoff";
import { clearSsoSession, readSsoSession, SESSION_EVENT, storeSsoSession, type SsoProfile, type SsoSession } from "./session";

type LoginAttempt = { state: string; verifier: string; createdAt: number; returnTo: string };
const ATTEMPT_KEY = "writing-lab-sso-attempt";
const PROJECT_KEY = "writing-lab-active-project";
const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readActiveProjectId() {
  try {
    const stored = sessionStorage.getItem(PROJECT_KEY);
    return stored && PROJECT_ID_PATTERN.test(stored) ? stored : null;
  } catch { return null; }
}

function base64Url(bytes: Uint8Array) {
  let value = "";
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return base64Url(bytes); }
async function challenge(verifier: string) { return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))); }
function safeReturnTo(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  const url = new URL(value, window.location.origin);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/";
}

async function startLogin(returnTo: string) {
  if (!SSO_BASE_URL || !SSO_CLIENT_ID || !SSO_CALLBACK_URL) throw new Error("Writing Lab chưa được đăng ký với HyperDataLab SSO.");
  const state = randomToken();
  const verifier = randomToken();
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ state, verifier, createdAt: Date.now(), returnTo: safeReturnTo(returnTo) } satisfies LoginAttempt));
  const authorize = new URL("/oauth/authorize", SSO_BASE_URL);
  authorize.search = new URLSearchParams({ response_type: "code", client_id: SSO_CLIENT_ID, redirect_uri: SSO_CALLBACK_URL,
    scope: "email profile hyperdatalab_profile", state, code_challenge: await challenge(verifier), code_challenge_method: "S256" }).toString();
  window.location.assign(authorize.toString());
}

async function finishCallback(): Promise<string> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const raw = sessionStorage.getItem(ATTEMPT_KEY);
  const attempt = raw ? JSON.parse(raw) as LoginAttempt : null;
  if (url.searchParams.has("error")) throw new Error(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Đăng nhập SSO thất bại.");
  if (!attempt || !code || !returnedState || attempt.state !== returnedState || Date.now() - attempt.createdAt > 10 * 60_000)
    throw new Error("Phiên SSO không hợp lệ hoặc đã hết hạn.");
  const tokenResponse = await fetch(new URL("/oauth/token", SSO_BASE_URL), { method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: SSO_CLIENT_ID,
      code, redirect_uri: SSO_CALLBACK_URL, code_verifier: attempt.verifier }) });
  const token = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!tokenResponse.ok || typeof token.access_token !== "string") throw new Error(typeof token.error_description === "string" ? token.error_description : "Không đổi được mã SSO.");
  const profileResponse = await fetch(new URL("/oauth/userinfo", SSO_BASE_URL), { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  const profile = await profileResponse.json().catch(() => ({})) as Partial<SsoProfile>;
  if (!profileResponse.ok || typeof profile.sub !== "string" || !isAllowedOrganizationEmail(profile.email, profile.email_verified)) throw new Error("Tài khoản SSO chưa được xác minh hoặc không thuộc tổ chức.");
  storeSsoSession({ accessToken: token.access_token, expiresAt: Date.now() + (typeof token.expires_in === "number" ? token.expires_in : 3600) * 1000,
    ...(typeof token.refresh_token === "string" ? { refreshToken: token.refresh_token } : {}),
    ...(typeof token.refresh_token_expires_in === "number" ? { refreshExpiresAt: Date.now() + token.refresh_token_expires_in * 1000 } : {}),
    refreshClientId: SSO_CLIENT_ID, profile: profile as SsoProfile });
  sessionStorage.removeItem(ATTEMPT_KEY);
  return safeReturnTo(attempt.returnTo);
}

let refreshTask: Promise<SsoSession | null> | null = null;
async function freshSession(current: SsoSession): Promise<SsoSession | null> {
  if (current.expiresAt > Date.now() + 5 * 60_000) return current;
  if (refreshTask) return refreshTask;
  if (current.handoff) {
    refreshTask = requestResearchHubTokenRefresh(current.handoff).then((fresh) => {
      const next = { ...current, ...fresh }; storeSsoSession(next); return next;
    });
  } else if (current.refreshToken && (!current.refreshExpiresAt || current.refreshExpiresAt > Date.now())) {
    refreshTask = fetch(new URL("/oauth/token", SSO_BASE_URL), { method: "POST", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: current.refreshClientId ?? SSO_CLIENT_ID, refresh_token: current.refreshToken }) })
      .then(async (response) => {
        const value = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok || typeof value.access_token !== "string") throw new Error("Không gia hạn được phiên SSO.");
        const next = { ...current, accessToken: value.access_token, expiresAt: Date.now() + (typeof value.expires_in === "number" ? value.expires_in : 3600) * 1000,
          ...(typeof value.refresh_token === "string" ? { refreshToken: value.refresh_token } : {}) };
        storeSsoSession(next); return next;
      });
  } else return current.expiresAt > Date.now() ? current : null;
  try { return await refreshTask; } finally { refreshTask = null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SsoSession | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [handoffFailed, setHandoffFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const requestedProjectId = url.searchParams.get("projectId");
    const hasProjectParam = url.searchParams.has("projectId");
    const projectFromUrl = requestedProjectId && PROJECT_ID_PATTERN.test(requestedProjectId) ? requestedProjectId : null;
    const savedSession = readSsoSession();
    const handoffProjectId = savedSession?.handoff?.projectId;
    const restoredHandoffProjectId = handoffProjectId && PROJECT_ID_PATTERN.test(handoffProjectId) ? handoffProjectId : null;
    const restoredProjectId = readActiveProjectId() ?? restoredHandoffProjectId;
    const activeProjectId = projectFromUrl ?? (hasProjectParam ? null : restoredProjectId);
    const projectTimer = window.setTimeout(() => setProjectId(activeProjectId), 0);
    const sync = () => setSession(readSsoSession());
    window.addEventListener("storage", sync); window.addEventListener(SESSION_EVENT, sync);
    const callbackPath = new URL(SSO_CALLBACK_URL).pathname;
    if (url.pathname === callbackPath) {
      void finishCallback().then((returnTo) => { if (active) window.location.replace(returnTo); }).catch((cause: unknown) => {
        if (!active) return; clearSsoSession(); setError(cause instanceof Error ? cause.message : "Không đăng nhập được."); setReady(true);
      });
    } else if (url.searchParams.has("rh_handoff")) {
      const request = parseHandoff(url);
      if (!request) window.setTimeout(() => { if (active) { setError("Liên kết ResearchHub handoff không hợp lệ."); setHandoffFailed(true); setReady(true); } }, 0);
      else void requestResearchHubSession(request, 15_000).then((next) => {
        if (!active) return; storeSsoSession(next); setSession(next); setError(""); clearHandoffFromUrl(); setReady(true);
      }).catch((cause: unknown) => {
        if (!active) return; setHandoffFailed(true); setError(cause instanceof Error ? cause.message : "Không nhận được phiên ResearchHub."); setReady(true);
      });
    } else {
      void Promise.resolve().then(() => {
        if (!active) return;
        setSession(savedSession);
        if (projectFromUrl && !savedSession && SSO_CLIENT_ID) return startLogin(`${url.pathname}${url.search}${url.hash}`).catch((cause: unknown) => {
          if (active) { setError(cause instanceof Error ? cause.message : "Không thể bắt đầu đăng nhập."); setReady(true); }
        });
        setReady(true);
      });
    }
    return () => { active = false; window.clearTimeout(projectTimer); window.removeEventListener("storage", sync); window.removeEventListener(SESSION_EVENT, sync); };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    try { sessionStorage.setItem(PROJECT_KEY, projectId); } catch { /* Session storage may be unavailable. */ }
  }, [projectId]);

  const signIn = useCallback(async () => { setError(""); try { await startLogin(`${window.location.pathname}${window.location.search}${window.location.hash}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể bắt đầu đăng nhập SSO."); } }, []);
  const signOut = useCallback(async () => {
    const current = readSsoSession(); const token = current?.handoff ? null : current?.refreshToken ?? current?.accessToken;
    if (token) await fetch(new URL("/oauth/revoke", SSO_BASE_URL), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => undefined);
    clearSsoSession(); setSession(null);
  }, []);
  const getAccessToken = useCallback(async () => {
    const current = readSsoSession(); if (!current) return null;
    try { const next = await freshSession(current); if (!next) return null; setSession(next); return next.expiresAt > Date.now() ? next.accessToken : null; }
    catch { return current.expiresAt > Date.now() ? current.accessToken : null; }
  }, []);

  const value = useMemo(() => ({ user: session?.profile ?? null, projectId, ready, error, handoffFailed, signIn, signOut, getAccessToken }),
    [session, projectId, ready, error, handoffFailed, signIn, signOut, getAccessToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
