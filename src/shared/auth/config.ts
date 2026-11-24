export const SSO_BASE_URL = (process.env.NEXT_PUBLIC_HYPERDATALAB_SSO_BASE_URL ?? "https://rpr-grobid-gateway.hpl-storage.workers.dev").replace(/\/+$/, "");
export const SSO_CLIENT_ID = process.env.NEXT_PUBLIC_HYPERDATALAB_SSO_CLIENT_ID ?? "";
export const SSO_CALLBACK_URL = process.env.NEXT_PUBLIC_HYPERDATALAB_SSO_CALLBACK_URL ?? "http://localhost:3000/auth/callback";
export const RESEARCH_HUB_URL = (process.env.NEXT_PUBLIC_RESEARCH_HUB_URL ?? "https://researchhub.hyperdatalab.org").replace(/\/+$/, "");
export const WORKER_API_URL = (process.env.NEXT_PUBLIC_WORKER_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
export const RESEARCH_HUB_ORIGINS = (process.env.NEXT_PUBLIC_RESEARCH_HUB_ORIGINS ?? "https://researchhub.hyperdatalab.org,http://localhost:3000")
  .split(",").map((origin) => origin.trim()).filter((origin) => {
    try { return new URL(origin).origin === origin; } catch { return false; }
  });

export function isAllowedOrganizationEmail(email: unknown, verified: unknown): email is string {
  return verified === true && typeof email === "string" && /^[^@\s]+@hyperdatalab\.org$/iu.test(email.trim());
}
