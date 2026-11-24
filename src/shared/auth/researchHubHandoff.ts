import { isAllowedOrganizationEmail, RESEARCH_HUB_ORIGINS, SSO_BASE_URL } from "./config";
import type { SsoProfile, SsoSession } from "./session";

const REQUEST = "paperlab.sso.handoff.request";
const RESPONSE = "researchhub.sso.handoff.response";
const REFRESH_REQUEST = "paperlab.sso.refresh.request";
const REFRESH_RESPONSE = "researchhub.sso.refresh.response";

export type HandoffRequest = { state: string; projectId: string };

export function parseHandoff(url: URL): HandoffRequest | null {
  const state = url.searchParams.get("rh_handoff");
  const projectId = url.searchParams.get("projectId");
  if (!state || !/^[A-Za-z0-9_-]{32,128}$/.test(state) || !projectId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) return null;
  return { state, projectId };
}

export function clearHandoffFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("rh_handoff");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function requestResearchHubSession(request: HandoffRequest, timeoutMs = 15_000, signal?: AbortSignal): Promise<SsoSession> {
  if (!window.opener) return Promise.reject(new Error("Mở Writing Lab từ project trong ResearchHub để nhận phiên."));
  if (!RESEARCH_HUB_ORIGINS.length || !SSO_BASE_URL) return Promise.reject(new Error("Chưa cấu hình nguồn ResearchHub handoff."));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, session?: SsoSession) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else if (session) resolve(session); else reject(new Error("ResearchHub không gửi được phiên."));
    };
    const timer = window.setTimeout(() => finish(new Error("Hết thời gian chờ phiên ResearchHub.")), timeoutMs);
    const onAbort = () => finish(new Error("ResearchHub handoff đã bị hủy."));
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!RESEARCH_HUB_ORIGINS.includes(event.origin) || event.source !== window.opener || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.type !== RESPONSE || message.state !== request.state || message.projectId !== request.projectId) return;
      if (message.error === "session_expired") return finish(new Error("Phiên ResearchHub hết hạn. Hãy đăng nhập lại ở ResearchHub."));
      if (typeof message.accessToken !== "string" || typeof message.expiresAt !== "number" || message.expiresAt <= Date.now()) return;
      void fetch(new URL("/oauth/userinfo", SSO_BASE_URL), { headers: { Authorization: `Bearer ${message.accessToken}` }, cache: "no-store" })
        .then(async (response) => {
          const profile = await response.json().catch(() => ({})) as Partial<SsoProfile>;
          if (!response.ok || typeof profile.sub !== "string" || !isAllowedOrganizationEmail(profile.email, profile.email_verified))
            throw new Error("ResearchHub gửi phiên SSO không hợp lệ.");
          finish(undefined, { accessToken: message.accessToken as string, expiresAt: message.expiresAt as number,
            handoff: { state: request.state, projectId: request.projectId }, profile: profile as SsoProfile });
        }).catch((cause: unknown) => finish(cause instanceof Error ? cause : new Error("Không xác minh được phiên ResearchHub.")));
    };
    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    for (const origin of RESEARCH_HUB_ORIGINS) window.opener?.postMessage({ type: REQUEST, ...request }, origin);
  });
}

export function requestResearchHubTokenRefresh(handoff: NonNullable<SsoSession["handoff"]>, timeoutMs = 12_000): Promise<{ accessToken: string; expiresAt: number }> {
  if (!window.opener) return Promise.reject(new Error("ResearchHub không còn mở để gia hạn phiên."));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, token?: { accessToken: string; expiresAt: number }) => {
      if (settled) return;
      settled = true; window.clearTimeout(timer); window.removeEventListener("message", onMessage);
      if (error) reject(error); else if (token) resolve(token); else reject(new Error("Không nhận được phiên mới."));
    };
    const timer = window.setTimeout(() => finish(new Error("Hết thời gian chờ gia hạn phiên.")), timeoutMs);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!RESEARCH_HUB_ORIGINS.includes(event.origin) || event.source !== window.opener || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.type !== REFRESH_RESPONSE || message.state !== handoff.state || message.projectId !== handoff.projectId || message.requestId !== requestId) return;
      if (message.error === "session_expired") return finish(new Error("Phiên ResearchHub hết hạn."));
      if (typeof message.accessToken === "string" && typeof message.expiresAt === "number" && message.expiresAt > Date.now())
        finish(undefined, { accessToken: message.accessToken, expiresAt: message.expiresAt });
    };
    window.addEventListener("message", onMessage);
    for (const origin of RESEARCH_HUB_ORIGINS) window.opener?.postMessage({ type: REFRESH_REQUEST, state: handoff.state, projectId: handoff.projectId, requestId }, origin);
  });
}
