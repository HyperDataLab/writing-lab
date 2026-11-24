"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, Clock3, FileText, History, Printer, ShieldCheck } from "lucide-react";
import { writingRepository, type VersionedWritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

type Evaluation = {
  sourceText: string;
  overallScore: number | null;
  coverage: number;
  confidence: number;
  contextLimited: boolean;
  metrics?: { wordCount: number; sentenceCount: number; meanSentenceLength: number };
  dimensionScores: Array<{ id: string; score: number | null; rationale: string }>;
  issues: Array<{ type: string; quote: string; rationale: string; status: string }>;
};
type Revision = { sourceText: string; revisedText: string; rationale: string; accepted: boolean; meaningCheck: { passed: boolean; missingEvidence: string[] } };

const dimensionNames: Record<string, string> = {
  sentence_structure: "Cấu trúc câu",
  flow_coherence: "Mạch lạc",
  precision: "Độ chính xác",
  conciseness: "Tính súc tích",
  evidence_alignment: "Mức độ phù hợp bằng chứng",
  claim_clarity: "Độ rõ luận điểm",
  academic_style: "Phong cách học thuật",
};

function readableName(value: string) {
  return dimensionNames[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decisionLabel(status: string) {
  if (status === "confirmed_by_human") return "Đã giữ lại";
  if (status === "dismissed_by_human") return "Đã bỏ qua";
  if (status === "candidate") return "Cần xem xét";
  return "Chờ người viết xem";
}

function isEvaluation(value: unknown): value is Evaluation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Evaluation>;
  return typeof candidate.sourceText === "string" && Array.isArray(candidate.dimensionScores) && Array.isArray(candidate.issues);
}

function isRevision(value: unknown): value is Revision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Revision>;
  return typeof candidate.sourceText === "string" && typeof candidate.revisedText === "string" &&
    !!candidate.meaningCheck && typeof candidate.meaningCheck.passed === "boolean" && Array.isArray(candidate.meaningCheck.missingEvidence);
}

export function ReportWorkspace() {
  const context = useWritingContext();
  const search = useSearchParams();
  const id = search.get("id") ?? "";
  const requestKey = `${context?.projectId ?? ""}:${id}`;
  const [loaded, setLoaded] = useState<{ key: string; item: VersionedWritingRecord | null; error: string }>({ key: "", item: null, error: "" });

  useEffect(() => {
    if (!context || !id) return;
    let active = true;
    void writingRepository.get(context, id)
      .then((record) => { if (active) setLoaded({ key: requestKey, item: record, error: record ? "" : "Không tìm thấy báo cáo này trong project hiện tại." }); })
      .catch((cause: unknown) => { if (active) setLoaded({ key: requestKey, item: null, error: cause instanceof Error ? cause.message : "Không tải được báo cáo." }); });
    return () => { active = false; };
  }, [context, id, requestKey]);

  const item = loaded.key === requestKey ? loaded.item : null;
  const error = loaded.key === requestKey ? loaded.error : "";

  const value = item?.record.payload;
  const evaluation = isEvaluation(value) ? value : null;
  const revision = isRevision(value) ? value : null;
  const createdAt = item ? new Date(item.record.createdAt).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : "";
  const recordType = item?.record.kind === "evaluation" ? "Đánh giá paragraph" : item?.record.kind === "revision" ? "Bản chỉnh sửa" : item?.record.kind === "generation" ? "Bản soạn" : item?.record.kind ?? "Báo cáo";

  if (!id) return <main className="tool-page report-state"><section className="report-state-panel"><span className="report-state-icon"><FileText size={20} /></span><h1>Chưa chọn báo cáo</h1><p>Mở một bản ghi từ lịch sử viết để xem báo cáo.</p><Link className="secondary-button" href="/history"><ArrowLeft size={15} />Về lịch sử viết</Link></section></main>;
  if (error) return <main className="tool-page report-state"><section className="report-state-panel" role="alert"><span className="report-state-icon report-state-error"><CircleAlert size={20} /></span><h1>Không tải được báo cáo</h1><p>{error}</p><Link className="secondary-button" href="/history"><ArrowLeft size={15} />Về lịch sử viết</Link></section></main>;
  if (!item) return <main className="tool-page report-state" role="status"><section className="report-loading" aria-label="Đang tải báo cáo"><span /><span /><span /><span /></section></main>;

  return <article className="tool-page report-page">
    <header className="report-header">
      <div className="report-heading-copy">
        <div className="report-breadcrumb"><Link href="/history"><ArrowLeft size={14} />Lịch sử viết</Link><span aria-hidden="true">/</span><span>Báo cáo</span></div>
        <div className="report-title-row"><span className="report-document-icon"><FileText size={19} /></span><div><p className="eyebrow">WRITING LAB <span>·</span> {recordType.toLocaleUpperCase("vi-VN")}</p><h1>{item.record.title}</h1></div></div>
        <div className="report-metadata"><span><Clock3 size={14} />{createdAt}</span><span className="report-metadata-dot" /><span>{recordType}</span><span className="report-metadata-dot" /><span>Schema v{item.record.schemaVersion}</span></div>
      </div>
      <div className="report-actions print-hide"><Link className="secondary-button" href="/history"><History size={15} />Lịch sử</Link><button className="primary-button" onClick={() => window.print()}><Printer size={15} />In / Lưu PDF</button></div>
    </header>

    {evaluation && <>
      <section className="panel report-overview" aria-label="Tóm tắt kết quả">
        <div className="report-summary-group report-summary-score">
          <span className="report-summary-label">Điểm tổng</span>
          <div className="report-score-line"><strong>{evaluation.overallScore ?? "—"}</strong><span>/ 100</span></div>
        </div>
        <div className="report-summary-group report-summary-quality">
          <div className="report-summary-metric"><span className="report-summary-label">Độ bao phủ</span><strong>{Math.round(evaluation.coverage * 100)}%</strong></div>
          <div className="report-summary-metric"><span className="report-summary-label">Độ tin cậy</span><strong>{Math.round(evaluation.confidence * 100)}%</strong></div>
        </div>
        {evaluation.metrics && <div className="report-summary-group report-summary-statistics">
          <span className="report-summary-label">Thống kê văn bản</span>
          <p>{evaluation.metrics.wordCount.toLocaleString("vi-VN")} từ · {evaluation.metrics.sentenceCount.toLocaleString("vi-VN")} câu · TB {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(evaluation.metrics.meanSentenceLength)} từ/câu</p>
        </div>}
        {evaluation.contextLimited && <p className="report-context-note"><CircleAlert size={15} />Kết quả có thể bị giới hạn bởi ngữ cảnh của paragraph.</p>}
      </section>

      <section className="panel report-source">
        <div className="report-section-heading"><div><h2>Văn bản nguồn</h2><p>Nội dung được dùng trong lần đánh giá này.</p></div><span className="report-section-tag"><ShieldCheck size={14} />Bản gốc</span></div>
        <p className="report-text">{evaluation.sourceText}</p>
      </section>

      <section className="report-dimensions">
        <div className="report-section-heading"><div><h2>Các chiều đánh giá</h2><p>Điểm số đi kèm giải thích cho từng tiêu chí.</p></div><span className="report-count">{evaluation.dimensionScores.length} tiêu chí</span></div>
        <div className="report-dimension-list">{evaluation.dimensionScores.map((dimension) => <article key={dimension.id} className="report-dimension">
          <div className="report-dimension-heading"><h3>{readableName(dimension.id)}</h3><span>{dimension.score === null ? "Chưa đủ căn cứ" : `${dimension.score} / 100`}</span></div>
          {dimension.score !== null && <div className="report-dimension-track" role="meter" aria-label={`Điểm ${readableName(dimension.id)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, dimension.score))}><span style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }} /></div>}
          <p>{dimension.rationale || "Không có giải thích cho tiêu chí này."}</p>
        </article>)}</div>
      </section>

      <section className="report-findings">
        <div className="report-section-heading"><div><h2>Phát hiện và quyết định</h2><p>Trích dẫn nguồn giúp bạn kiểm tra từng nhận xét.</p></div><span className="report-count">{evaluation.issues.length} phát hiện</span></div>
        {evaluation.issues.length ? <div className="report-finding-list">{evaluation.issues.map((issue, index) => <article className="report-finding" key={`${index}-${issue.type}`}>
          <div className="report-finding-heading"><div><h3>{readableName(issue.type)}</h3><blockquote>{issue.quote}</blockquote></div><span className={`report-decision${issue.status === "confirmed_by_human" ? " is-confirmed" : issue.status === "dismissed_by_human" ? " is-dismissed" : ""}`}>{issue.status === "confirmed_by_human" && <Check size={13} />}{decisionLabel(issue.status)}</span></div>
          <div className="report-finding-rationale"><span>Lý do nhận xét</span><p>{issue.rationale}</p></div>
        </article>)}</div> : <p className="report-empty-findings">Không có phát hiện nào được neo chính xác vào văn bản nguồn.</p>}
      </section>
    </>}

    {revision && <>
      <section className="panel report-revision">
        <div className="report-section-heading"><div><h2>Bản chỉnh sửa</h2><p>{revision.accepted ? "Bản sửa đã được người viết duyệt." : "Bản sửa đang chờ người viết duyệt."}</p></div><span className={revision.accepted ? "report-section-tag is-accepted" : "report-section-tag is-pending"}>{revision.accepted ? "Đã duyệt" : "Chờ duyệt"}</span></div>
        <p className="report-text">{revision.revisedText}</p>{revision.rationale && <p className="report-rationale">{revision.rationale}</p>}
        {!revision.meaningCheck.passed && <p className="report-context-note"><CircleAlert size={15} />Cần kiểm tra marker bị thiếu: {revision.meaningCheck.missingEvidence.join(", ")}</p>}
      </section>
      <section className="panel report-source"><div className="report-section-heading"><div><h2>Văn bản gốc</h2><p>Dùng để đối chiếu với bản chỉnh sửa.</p></div></div><p className="report-text">{revision.sourceText}</p></section>
    </>}

    {!evaluation && !revision && <section className="panel report-raw"><div className="report-section-heading"><div><h2>Dữ liệu báo cáo</h2><p>Bản ghi này chưa có định dạng báo cáo chuyên biệt.</p></div></div><pre className="json-report">{JSON.stringify(value, null, 2)}</pre></section>}
    <footer className="report-disclaimer"><ShieldCheck size={15} /><p>Đây là hỗ trợ biên tập; báo cáo không xác minh tính đúng khoa học hoặc nguồn trích dẫn.</p></footer>
  </article>;
}
