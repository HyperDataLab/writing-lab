import { workerRequest, type ApiContext } from "@/shared/worker/api";
import { writingRecordSchema, type WritingKind, type WritingRecord } from "@/core/schemas/writing";

export type { WritingRecord } from "@/core/schemas/writing";

export type VersionedWritingRecord = { record: WritingRecord; version: string };

export const writingRepository = {
  async list(context: ApiContext) {
    return workerRequest<{ items: Array<{ id: string }>; nextCursor: string | null }>(context, "/v1/documents");
  },
  async get(context: ApiContext, id: string) {
    const token = await context.getToken();
    if (!token) throw new Error("Phiên ResearchHub đã hết hạn. Hãy đăng nhập lại.");
    const response = await fetch(`${process.env.NEXT_PUBLIC_WORKER_API_URL ?? "http://localhost:8787"}/v1/documents/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Project-Id": context.projectId }, cache: "no-store",
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new Error(`Không tải được văn bản (HTTP ${response.status}).`);
    const tag = /^(?:W\/)?"([^"\r\n]+)"$/.exec(response.headers.get("ETag") ?? "");
    const record = writingRecordSchema.parse(await response.json());
    if (!tag) throw new Error("Firestore không trả về phiên bản bản ghi hợp lệ.");
    return { record, version: tag[1] } satisfies VersionedWritingRecord;
  },
  async save(context: ApiContext, record: WritingRecord, expectedVersion: string | null) {
    const validRecord = writingRecordSchema.parse(record);
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set(expectedVersion === null ? "If-None-Match" : "If-Match", expectedVersion === null ? "*" : `"${expectedVersion}"`);
    return workerRequest<{ version: string }>(context, `/v1/documents/${encodeURIComponent(record.id)}`, {
      method: "PUT", headers, body: JSON.stringify(validRecord),
    });
  },
  async remove(context: ApiContext, id: string, version: string) {
    return workerRequest<null>(context, `/v1/documents/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: { "If-Match": `"${version}"` },
    });
  },
  async listRecords(context: ApiContext) {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?${new URLSearchParams({ cursor })}` : "";
      const page: { items: Array<{ id: string }>; nextCursor: string | null } = await workerRequest(context, `/v1/documents${query}`);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor && ids.length < 1000);
    const records: VersionedWritingRecord[] = [];
    for (let start = 0; start < ids.length; start += 16) {
      const page = await Promise.all(ids.slice(start, start + 16).map((id) => writingRepository.get(context, id)));
      records.push(...page.filter((item): item is VersionedWritingRecord => item !== null));
    }
    return records.sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
  },
};

export function newWritingRecord(kind: WritingKind, title: string, payload: unknown): WritingRecord {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), kind, title, createdAt: now, updatedAt: now, schemaVersion: 1, payload };
}
