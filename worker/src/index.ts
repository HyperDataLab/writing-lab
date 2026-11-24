import { Hono } from "hono";
import { cors } from "hono/cors";
import { importPKCS8, SignJWT } from "jose";
import type { Context } from "hono";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const MAX_DOCUMENT_BYTES = 1024 * 1024 - 4096;
const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type ServiceBinding = { fetch(request: Request): Promise<Response> };
type Identity = { uid: string; email: string };
type Project = { id: string; name: string };
type Env = {
  Bindings: {
    ALLOWED_ORIGINS: string;
    ALLOWED_DOMAIN: string;
    SSO_BASE_URL: string;
    RESEARCH_HUB_API_URL: string;
    RESEARCH_HUB?: ServiceBinding;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;
    LLM_ALLOWED_HOSTS?: string;
  };
  Variables: { identity: Identity; project: Project; projectId: string; token: string };
};

const app = new Hono<Env>();
app.use("*", cors({
  origin: (origin: string, context: Context<Env>) => context.env.ALLOWED_ORIGINS.split(",").map((value: string) => value.trim()).includes(origin) ? origin : "",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "If-Match", "If-None-Match", "X-Project-Id", "X-LLM-API-Key", "X-LLM-Base-URL"],
  exposeHeaders: ["ETag"],
  maxAge: 600,
}));

app.get("/api/health", (context) => context.json({ service: "writing-lab-api", status: "ok" }));

async function researchHubFetch(env: Env["Bindings"], path: string, token: string) {
  const base = env.RESEARCH_HUB_API_URL?.trim();
  if (!base) throw new Error("ResearchHub API URL is not configured.");
  const request = new Request(new URL(path, base), { headers: { Authorization: `Bearer ${token}` } });
  return env.RESEARCH_HUB ? env.RESEARCH_HUB.fetch(request) : fetch(request);
}

app.use("/v1/*", async (context, next) => {
  const authorization = context.req.header("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return context.json({ error: "unauthenticated", message: "Đăng nhập ResearchHub để tiếp tục." }, 401);
  let identity: Identity;
  try {
    const response = await fetch(new URL("/oauth/userinfo", context.env.SSO_BASE_URL), { headers: { Authorization: `Bearer ${token}` } });
    const profile = await response.json().catch(() => null) as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown } | null;
    if (!response.ok || !profile || typeof profile.sub !== "string" || typeof profile.email !== "string" || profile.email_verified !== true) {
      return context.json({ error: "unauthenticated", message: "Phiên SSO không hợp lệ hoặc đã hết hạn." }, 401);
    }
    const domain = context.env.ALLOWED_DOMAIN.toLowerCase();
    if (profile.email.slice(profile.email.lastIndexOf("@") + 1).toLowerCase() !== domain || !profile.email.includes("@")) {
      return context.json({ error: "forbidden", message: "Tài khoản không thuộc tổ chức được phép." }, 403);
    }
    identity = { uid: profile.sub, email: profile.email };
  } catch {
    return context.json({ error: "sso_unavailable", message: "Không xác minh được phiên SSO." }, 502);
  }

  const headerProjectId = context.req.header("X-Project-Id")?.trim() ?? "";
  const queryProjectId = new URL(context.req.url).searchParams.get("projectId")?.trim() ?? "";
  if (headerProjectId && queryProjectId && headerProjectId.toLowerCase() !== queryProjectId.toLowerCase())
    return context.json({ error: "project_mismatch", message: "Project ID trong request không khớp." }, 400);
  const projectId = (headerProjectId || queryProjectId).toLowerCase();
  if (!PROJECT_ID_PATTERN.test(projectId)) return context.json({ error: "project_required", message: "Hãy mở Writing Lab từ một project ResearchHub hợp lệ." }, 400);

  let project: Project | null = null;
  try {
    const response = await researchHubFetch(context.env, "/api/projects", token);
    if (!response.ok) return context.json({ error: "researchhub_unavailable", message: `ResearchHub trả về HTTP ${response.status}.` }, 502);
    const body = await response.json().catch(() => null) as { items?: unknown } | null;
    if (!body || !Array.isArray(body.items)) return context.json({ error: "researchhub_invalid", message: "ResearchHub trả về danh sách project không hợp lệ." }, 502);
    const match = body.items.find((item): item is { id: string; name: string } => !!item && typeof item === "object" &&
      "id" in item && item.id === projectId && "name" in item && typeof item.name === "string");
    project = match ? { id: match.id, name: match.name } : null;
  } catch {
    return context.json({ error: "researchhub_unavailable", message: "Không xác minh được quyền truy cập project." }, 502);
  }
  if (!project) return context.json({ error: "project_forbidden", message: "Project không tồn tại hoặc không thuộc tài khoản này." }, 404);
  context.set("identity", identity);
  context.set("project", project);
  context.set("projectId", projectId);
  context.set("token", token);
  await next();
});

type ServiceAccount = { client_email?: string; private_key?: string; project_id?: string; private_key_id?: string };
let cachedGoogleToken: { token: string; expiresAt: number } | null = null;
async function googleAccessToken(env: Env["Bindings"]): Promise<string> {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) return cachedGoogleToken.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Firebase service account is not configured.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  if (!account.client_email || !account.private_key) throw new Error("Firebase service account is invalid.");
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: FIRESTORE_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", ...(account.private_key_id ? { kid: account.private_key_id } : {}) })
    .setIssuer(account.client_email).setSubject(account.client_email).setAudience(TOKEN_URL)
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const body = await response.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown };
  if (!response.ok || typeof body.access_token !== "string") throw new Error("Firebase authentication failed.");
  cachedGoogleToken = { token: body.access_token, expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000 };
  return cachedGoogleToken.token;
}

function firestoreDocumentUrl(account: ServiceAccount, context: Context<Env>, id?: string) {
  if (!account.project_id) throw new Error("Firebase service account is missing project_id.");
  const uid = encodeURIComponent(context.get("identity").uid);
  const projectId = encodeURIComponent(context.get("projectId"));
  const recordId = id ? `/${encodeURIComponent(id)}` : "";
  const path = `/v1/projects/${encodeURIComponent(account.project_id)}/databases/(default)/documents/users/${uid}/projects/${projectId}/writingRecords${recordId}`;
  return new URL(path, "https://firestore.googleapis.com");
}
function documentTag(updateTime: string) { return `"${updateTime}"`; }
function parseUpdateTime(value: string | undefined) {
  const match = /^(?:W\/)?"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)"$/.exec(value?.trim() ?? "");
  return match?.[1] ?? null;
}
function firestoreUnavailable(context: { json: (body: unknown, status?: number) => Response }, error: unknown) {
  const message = error instanceof Error ? error.message : "Firestore is unavailable.";
  return context.json({ error: "firestore_unavailable", message }, 503);
}
function firestoreResponseError(context: { json: (body: unknown, status?: number) => Response }, response: Response, fallback: string) {
  return context.json({ error: "firestore_unavailable", message: `${fallback} (HTTP ${response.status}).` }, 503);
}
async function isFirestoreConflict(response: Response) {
  if (response.status === 409 || response.status === 412) return true;
  const body = await response.clone().json().catch(() => null) as { error?: { status?: unknown } } | null;
  return body?.error?.status === "FAILED_PRECONDITION" || body?.error?.status === "ABORTED";
}

app.get("/v1/me", (context) => context.json({ email: context.get("identity").email, project: context.get("project") }));

app.get("/v1/documents", async (context) => {
  try {
    const account = JSON.parse(context.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}") as ServiceAccount;
    const url = firestoreDocumentUrl(account, context);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("orderBy", "updatedAt desc");
    url.searchParams.set("mask.fieldPaths", "id");
    const cursor = context.req.query("cursor");
    if (cursor) url.searchParams.set("pageToken", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${await googleAccessToken(context.env)}` } });
    if (!response.ok) return firestoreResponseError(context, response, "Không đọc được danh sách bản ghi Firestore");
    const body = await response.json().catch(() => ({})) as {
      documents?: Array<{ name?: string; fields?: { id?: { stringValue?: string } } }>;
      nextPageToken?: string;
    };
    const items = (body.documents ?? []).flatMap((document) => {
      const id = document.fields?.id?.stringValue ?? document.name?.split("/").at(-1) ?? "";
      return DOCUMENT_ID_PATTERN.test(id) ? [{ id }] : [];
    });
    return context.json({ items, nextCursor: body.nextPageToken ?? null });
  } catch (error) { return firestoreUnavailable(context, error); }
});

app.get("/v1/documents/:id", async (context) => {
  const id = context.req.param("id");
  if (!DOCUMENT_ID_PATTERN.test(id)) return context.json({ error: "invalid_id", message: "Document ID không hợp lệ." }, 400);
  try {
    const account = JSON.parse(context.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}") as ServiceAccount;
    const url = firestoreDocumentUrl(account, context, id);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${await googleAccessToken(context.env)}` } });
    if (response.status === 404) return new Response(null, { status: 204 });
    if (!response.ok) return firestoreResponseError(context, response, "Không đọc được bản ghi Firestore");
    const document = await response.json().catch(() => ({})) as {
      fields?: { recordJson?: { stringValue?: string } };
      updateTime?: string;
    };
    const recordJson = document.fields?.recordJson?.stringValue;
    if (!recordJson || !document.updateTime) return context.json({ error: "firestore_invalid_document", message: "Bản ghi Firestore thiếu dữ liệu hoặc phiên bản." }, 502);
    const etag = documentTag(document.updateTime);
    if (context.req.header("If-None-Match")?.replace(/^W\//, "") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    return new Response(recordJson, { status: 200, headers: { "Content-Type": "application/json", ETag: etag, "Cache-Control": "private, no-cache" } });
  } catch (error) { return firestoreUnavailable(context, error); }
});

app.put("/v1/documents/:id", async (context) => {
  const id = context.req.param("id");
  if (!DOCUMENT_ID_PATTERN.test(id)) return context.json({ error: "invalid_id", message: "Document ID không hợp lệ." }, 400);
  const isCreate = context.req.header("If-None-Match") === "*";
  const expected = parseUpdateTime(context.req.header("If-Match"));
  if ((isCreate && context.req.header("If-Match")) || (!isCreate && !expected)) return context.json({ error: "precondition_required", message: "Thiếu phiên bản lưu văn bản." }, 428);
  const text = await context.req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_DOCUMENT_BYTES) return context.json({ error: "too_large", message: "Văn bản vượt giới hạn 1 MiB." }, 413);
  let document: unknown;
  try { document = JSON.parse(text); } catch { return context.json({ error: "invalid_json", message: "Văn bản phải là JSON hợp lệ." }, 400); }
  if (!document || typeof document !== "object" || !("id" in document) || document.id !== id || !("kind" in document) || typeof document.kind !== "string" || !("title" in document) || typeof document.title !== "string" || !("createdAt" in document) || typeof document.createdAt !== "string" || !("updatedAt" in document) || typeof document.updatedAt !== "string") return context.json({ error: "invalid_document", message: "Document ID hoặc trường bản ghi không hợp lệ." }, 400);
  try {
    const account = JSON.parse(context.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}") as ServiceAccount;
    const url = firestoreDocumentUrl(account, context, id);
    if (isCreate) url.searchParams.set("currentDocument.exists", "false");
    else if (expected) url.searchParams.set("currentDocument.updateTime", expected);
    const token = await googleAccessToken(context.env);
    const response = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        id: { stringValue: id },
        kind: { stringValue: document.kind },
        title: { stringValue: document.title },
        createdAt: { timestampValue: document.createdAt },
        updatedAt: { timestampValue: document.updatedAt },
        recordJson: { stringValue: text },
      } }),
    });
    if (!response.ok && await isFirestoreConflict(response)) return context.json({ error: "conflict", message: "Văn bản đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu." }, 412);
    if (!response.ok) return firestoreResponseError(context, response, "Không lưu được bản ghi Firestore");
    const result = await response.json().catch(() => ({})) as { updateTime?: string };
    if (!result.updateTime) return context.json({ error: "firestore_invalid_document", message: "Firestore không trả về phiên bản bản ghi." }, 502);
    return context.json({ version: result.updateTime }, 200, { ETag: documentTag(result.updateTime) });
  } catch (error) { return firestoreUnavailable(context, error); }
});

app.delete("/v1/documents/:id", async (context) => {
  const id = context.req.param("id");
  const expected = parseUpdateTime(context.req.header("If-Match"));
  if (!DOCUMENT_ID_PATTERN.test(id) || !expected) return context.json({ error: "precondition_required", message: "Document ID hoặc phiên bản không hợp lệ." }, 428);
  try {
    const account = JSON.parse(context.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}") as ServiceAccount;
    const url = firestoreDocumentUrl(account, context, id);
    url.searchParams.set("currentDocument.updateTime", expected);
    const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${await googleAccessToken(context.env)}` } });
    if (response.status === 404) return context.json({ error: "not_found", message: "Không tìm thấy văn bản." }, 404);
    if (!response.ok && await isFirestoreConflict(response)) return context.json({ error: "conflict", message: "Văn bản đã được cập nhật ở nơi khác." }, 412);
    if (!response.ok) return firestoreResponseError(context, response, "Không xóa được bản ghi Firestore");
    return new Response(null, { status: 204 });
  } catch (error) { return firestoreUnavailable(context, error); }
});

app.post("/v1/llm/chat/completions", async (context) => {
  const apiKey = context.req.header("X-LLM-API-Key")?.trim();
  const baseUrl = context.req.header("X-LLM-Base-URL")?.trim();
  if (!apiKey || !baseUrl) return context.json({ error: "llm_not_configured", message: "Cấu hình 9router chưa đầy đủ." }, 400);
  let endpoint: URL;
  try { endpoint = new URL(baseUrl); } catch { return context.json({ error: "invalid_endpoint", message: "Endpoint 9router không hợp lệ." }, 400); }
  const allowed = (context.env.LLM_ALLOWED_HOSTS ?? "9router.dcloud.io.vn,9router.oraltest.site").split(",").map((host) => host.trim().toLowerCase());
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !allowed.includes(endpoint.hostname.toLowerCase()) || endpoint.pathname.includes(".."))
    return context.json({ error: "endpoint_not_allowed", message: "Endpoint 9router chưa được Worker cho phép." }, 400);
  const body = await context.req.arrayBuffer();
  if (body.byteLength > 8 * 1024 * 1024) return context.json({ error: "too_large", message: "Yêu cầu AI vượt giới hạn." }, 413);
  let streamRequested = false;
  try { streamRequested = (JSON.parse(new TextDecoder().decode(body)) as { stream?: unknown }).stream === true; } catch { /* The upstream will return the request validation error. */ }
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/chat/completions`;
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body, signal: context.req.raw.signal });
    if (response.ok && !streamRequested && response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream")) {
      const completion = await collectChatCompletionStream(await response.text());
      return context.json(completion);
    }
    const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": response.headers.get("Content-Type") ?? "application/json" });
    const retryAfter = response.headers.get("Retry-After"); if (retryAfter) headers.set("Retry-After", retryAfter);
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("9router")) return context.json({ error: "invalid_llm_response", message: error.message }, 502);
    return context.json({ error: "llm_unavailable", message: "Không kết nối được với 9router." }, 502);
  }
});

function collectChatCompletionStream(source: string) {
  const choices = new Map<number, { index: number; role: string; content: string; finish_reason: string | null }>();
  let id = "chatcmpl-writing-lab";
  let model = "";
  let created = Math.floor(Date.now() / 1000);
  let usage: unknown;

  for (const event of source.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
    if (!data || data === "[DONE]") continue;
    let chunk: { id?: unknown; model?: unknown; created?: unknown; usage?: unknown; error?: unknown; choices?: Array<{ index?: unknown; delta?: { role?: unknown; content?: unknown }; message?: { role?: unknown; content?: unknown }; text?: unknown; finish_reason?: unknown }> };
    try { chunk = JSON.parse(data) as typeof chunk; }
    catch { throw new Error("9router trả về một sự kiện SSE không phải JSON hợp lệ."); }
    if (chunk.error) throw new Error(typeof chunk.error === "string" ? chunk.error : JSON.stringify(chunk.error));
    if (typeof chunk.id === "string") id = chunk.id;
    if (typeof chunk.model === "string") model = chunk.model;
    if (typeof chunk.created === "number") created = chunk.created;
    if (chunk.usage) usage = chunk.usage;
    for (const item of chunk.choices ?? []) {
      const index = typeof item.index === "number" ? item.index : 0;
      const choice = choices.get(index) ?? { index, role: "assistant", content: "", finish_reason: null };
      const role = item.delta?.role ?? item.message?.role;
      const content = item.delta?.content ?? item.message?.content ?? item.text;
      if (typeof role === "string") choice.role = role;
      if (typeof content === "string") choice.content += content;
      if (typeof item.finish_reason === "string" || item.finish_reason === null) choice.finish_reason = item.finish_reason;
      choices.set(index, choice);
    }
  }

  if (!choices.size) throw new Error("9router trả về luồng SSE nhưng không có nội dung hoàn chỉnh.");
  return {
    id,
    object: "chat.completion",
    created,
    ...(model ? { model } : {}),
    choices: [...choices.values()].sort((a, b) => a.index - b.index).map(({ index, role, content, finish_reason }) => ({ index, message: { role, content }, finish_reason })),
    ...(usage ? { usage } : {}),
  };
}

app.notFound((context) => context.json({ error: "not_found", message: "Không tìm thấy API." }, 404));
export default app;
