import { isAllowedOrganizationEmail } from "./config";

export const SESSION_KEY = "writing-lab-sso-session";
export const SESSION_EVENT = "writing-lab-sso-session-change";

export type SsoProfile = { sub: string; email: string; email_verified: boolean; name?: string };
export type SsoSession = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
  refreshClientId?: string;
  handoff?: { state: string; projectId: string };
  profile: SsoProfile;
};

export function readSsoSession(): SsoSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SsoSession>;
    if (typeof value.accessToken !== "string" || typeof value.expiresAt !== "number" ||
      !value.profile || typeof value.profile.sub !== "string" ||
      !isAllowedOrganizationEmail(value.profile.email, value.profile.email_verified)) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return value as SsoSession;
  } catch { return null; }
}

export function storeSsoSession(session: SsoSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSsoSession() {
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}
