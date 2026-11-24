"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { compareMeaning, diffWords } from "@/core/writing/safety";
import { writingRepository, type VersionedWritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

type Before = { sourceText: string; overallScore: number | null; dimensionScores: Array<{ id: string; score: number | null }> };
type After = { sourceText?: string; revisedText?: string; overallScore?: number | null; dimensionScores?: Array<{ id: string; score: number | null }> };

export function CompareWorkspace() {
  const context = useWritingContext();
  const search = useSearchParams();
  const beforeId = search.get("before") ?? "";
  const afterId = search.get("after") ?? "";
  const [before, setBefore] = useState<VersionedWritingRecord | null>(null);
  const [after, setAfter] = useState<VersionedWritingRecord | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!context || !beforeId || !afterId) return;
    void Promise.all([writingRepository.get(context, beforeId), writingRepository.get(context, afterId)]).then(([left, right]) => { setBefore(left); setAfter(right); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Không tải được hai phiên bản."));
  }, [context, beforeId, afterId]);
  const beforeData = before?.record.payload as Before | undefined;
  const afterData = after?.record.payload as After | undefined;
  const afterText = afterData?.revisedText ?? afterData?.sourceText ?? "";
  const sourceText = beforeData?.sourceText ?? "";
  const diff = sourceText && afterText ? diffWords(sourceText, afterText) : [];
  const meaning = sourceText && afterText ? compareMeaning(sourceText, afterText) : null;

  return <div className="tool-page compare-page"><header className="tool-header"><div><p className="eyebrow">COMPARE · BEFORE / AFTER</p><h1>So sánh phiên bản</h1><p>Bản gốc và bản sửa được giữ nguyên, kèm kiểm tra ý nghĩa tự động.</p></div><Link href="/history" className="secondary-button">Lịch sử</Link></header>
    {error && <p className="error-note">{error}</p>}{!before || !after ? <p className="hint">Đang tải hai phiên bản…</p> : <><section className="panel"><div className="section-title"><div><h2>{before.record.title}</h2><p className="hint">{before.record.kind} · {new Date(before.record.updatedAt).toLocaleString()}</p></div><div><h2>{after.record.title}</h2><p className="hint">{after.record.kind} · {new Date(after.record.updatedAt).toLocaleString()}</p></div></div><div className="diff-text">{diff.map((part, index) => <span key={`${index}-${part.value}`} className={part.type === "added" ? "diff-added" : part.type === "removed" ? "diff-removed" : undefined}>{part.value}</span>)}</div></section>
      <section className="panel"><h2>Meaning checks</h2><p className={meaning?.passed ? "success-note" : "error-note"}>{meaning?.passed ? "Không phát hiện số liệu, citation hoặc marker ý nghĩa bị mất theo kiểm tra tự động." : "Có marker cần người viết kiểm tra; kiểm tra tự động không chứng minh hai văn bản tương đương."}</p>{meaning && (!meaning.passed) && <p className="hint">Thiếu: {[...meaning.missingEvidence].join(", ") || "hedging / phủ định"}</p>}</section>
      <section className="panel"><h2>Điểm trước / sau</h2><div className="score-grid"><div className="score"><strong>{beforeData?.overallScore ?? "—"}</strong><span>Trước</span></div><div className="score"><strong>{afterData?.overallScore ?? "—"}</strong><span>Sau (chỉ có nếu đã đánh giá lại)</span></div></div></section></>}
  </div>;
}
