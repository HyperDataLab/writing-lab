import { WORKER_API_URL } from "@/shared/auth/config";

export type ApiContext = { getToken: () => Promise<string | null>; projectId: string };

function parseChatCompletionStream(source: string) {
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
    catch { throw new Error("Writing Lab nhận được một sự kiện SSE không phải JSON hợp lệ."); }
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
  if (!choices.size) throw new Error("Writing Lab nhận được luồng SSE nhưng không có nội dung.");
  return { id, object: "chat.completion", created, ...(model ? { model } : {}),
    choices: [...choices.values()].sort((a, b) => a.index - b.index).map(({ index, role, content, finish_reason }) => ({ index, message: { role, content }, finish_reason })),
    ...(usage ? { usage } : {}) };
}

export async function workerRequest<T>(context: ApiContext, path: string, init: RequestInit = {}): Promise<T> {
  const token = await context.getToken();
  if (!token) throw new Error("Phiên ResearchHub đã hết hạn. Hãy đăng nhập lại.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Project-Id", context.projectId);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${WORKER_API_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message : `Writing Lab API trả về HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (response.status === 204) return null as T;
  const responseText = await response.text();
  if (response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream") || /^\s*data:/m.test(responseText)) {
    return parseChatCompletionStream(responseText) as T;
  }
  try { return JSON.parse(responseText) as T; }
  catch { throw new Error("Writing Lab API trả về dữ liệu không phải JSON hợp lệ."); }
}
