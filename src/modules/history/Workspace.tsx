"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { writingRepository, type VersionedWritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

const label: Record<string, string> = { evaluation: "Evaluate", revision: "Revise", generation: "Generate", calibration: "Calibration" };

export function HistoryWorkspace() {
  const context = useWritingContext();
  const [records, setRecords] = useState<VersionedWritingRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!context) return;
    let active = true;
    void writingRepository.listRecords(context).then((items) => { if (active) setRecords(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Không tải được lịch sử."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [context]);

  async function remove(item: VersionedWritingRecord) {
    if (!context || pendingDelete !== item.record.id) { setPendingDelete(item.record.id); return; }
    try { await writingRepository.remove(context, item.record.id, item.version); setPendingDelete(null); const items = await writingRepository.listRecords(context); setRecords(items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không xóa được record."); }
  }
  function href(item: VersionedWritingRecord) {
    if (item.record.kind === "evaluation") return `/report?id=${encodeURIComponent(item.record.id)}`;
    if (item.record.kind === "revision") {
      const payload = item.record.payload as { evaluationId?: string };
      return `/compare?before=${encodeURIComponent(payload.evaluationId ?? "")}&after=${encodeURIComponent(item.record.id)}`;
    }
    return `/report?id=${encodeURIComponent(item.record.id)}`;
  }

  return <div className="tool-page"><header className="tool-header"><div><p className="eyebrow">HISTORY · WRITING RECORDS</p><h1>Lịch sử viết</h1><p>Evaluate, revision, generation và calibration lưu trong Firestore theo project hiện tại.</p></div><span className="badge">{records.length} RECORDS</span></header>
    {error && <p className="error-note" role="alert">{error}</p>}{loading ? <p className="hint">Đang tải lịch sử…</p> : records.length === 0 ? <section className="panel"><h2>Chưa có dữ liệu</h2><p className="hint">Kết quả mới sẽ xuất hiện tại đây.</p></section> : <div className="record-list">{records.map((item) => <article className="record-row" key={item.record.id}><div><span className="badge">{label[item.record.kind] ?? item.record.kind}</span><h3>{item.record.title || "Untitled"}</h3><p>{new Date(item.record.updatedAt).toLocaleString()} · schema v{item.record.schemaVersion}</p></div><div className="record-actions"><Link className="secondary-button" href={href(item)}>Mở record</Link><button className="secondary-button" onClick={() => void remove(item)}>{pendingDelete === item.record.id ? "Xác nhận xóa" : "Xóa"}</button></div></article>)}</div>}
  </div>;
}
