import { workerRequest, type ApiContext } from "@/shared/worker/api";

const SETTINGS_KEY = "writing-lab-llm-settings-v1";
const CONSENT_KEY = "writing-lab-ai-consent-v1";

export type LlmSettings = { baseUrl: string; model: string; apiKey: string };
const defaults: LlmSettings = { baseUrl: "https://9router.dcloud.io.vn/v1", model: "cx/gpt-6-luna", apiKey: "" };

export function readLlmSettings(): LlmSettings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<LlmSettings> }; }
  catch { return defaults; }
}
export function writeLlmSettings(settings: LlmSettings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
export function hasAiConsent() { return localStorage.getItem(CONSENT_KEY) === "accepted-v1"; }
export function revokeAiConsent() { localStorage.removeItem(CONSENT_KEY); }
export function grantAiConsent() { localStorage.setItem(CONSENT_KEY, "accepted-v1"); }

export async function askWritingModel<T>(context: ApiContext, messages: Array<{ role: "system" | "user"; content: string }>): Promise<T> {
  const settings = readLlmSettings();
  if (!settings.apiKey.trim()) throw new Error("Hãy nhập API key 9router trong mục Cài đặt.");
  const result = await workerRequest<{ choices?: Array<{ message?: { content?: unknown } }> }>(context, "/v1/llm/chat/completions", {
    method: "POST", headers: { "X-LLM-API-Key": settings.apiKey, "X-LLM-Base-URL": settings.baseUrl },
    body: JSON.stringify({ model: settings.model, stream: false, temperature: 0.2, response_format: { type: "json_object" }, messages }),
  });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model không trả về JSON văn bản.");
  const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(jsonText) as T; } catch { throw new Error("Không đọc được kết quả JSON từ model."); }
}
