"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, FileText, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { compareMeaning, diffWords } from "@/core/writing/safety";
import { askWritingModel } from "@/shared/llm/settings";
import { useAiConsent } from "@/shared/llm/AiConsentProvider";
import { Select } from "@/shared/ui/Select";
import { writingRepository, newWritingRecord, type VersionedWritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

type Evaluation = { sourceText: string; issues: Array<{ id: string; type: string; status: string; quote: string; rationale: string; suggestion: string }> };
type Revision = { evaluationId: string; sourceText: string; revisedText: string; selectedIssueIds: string[]; rationale: string; meaningCheck: ReturnType<typeof compareMeaning>; status: "proposed" | "needs_evidence" | "accepted"; accepted: boolean };

export function ReviseWorkspace() {
  const context = useWritingContext();
  const requestAiConsent = useAiConsent();
  const searchParams = useSearchParams();
  const initialId = searchParams.get("evaluationId");
  const [evaluations, setEvaluations] = useState<VersionedWritingRecord[]>([]);
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [saved, setSaved] = useState<VersionedWritingRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadingEvaluations = !context || loadedProjectId !== context.projectId;

  useEffect(() => {
    if (!context) return;
    let active = true;
    void writingRepository.listRecords(context).then((records) => {
      const found = records.filter((item) => item.record.kind === "evaluation" && isEvaluation(item.record.payload));
      if (!active) return;
      setEvaluations(found);
      setLoadedProjectId(context.projectId);
      setError("");
      setSelectedId((current) => current || found[0]?.record.id || "");
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Không tải được lịch sử.");
      setLoadedProjectId(context.projectId);
    });
    return () => { active = false; };
  }, [context]);

  const current = evaluations.find((item) => item.record.id === selectedId) ?? null;
  const evaluation = current?.record.payload as Evaluation | undefined;
  const issues = useMemo(() => (evaluation?.issues ?? []).filter((issue) => selectedIssues.includes(issue.id)), [evaluation, selectedIssues]);

  function toggleIssue(id: string) { setSelectedIssues((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]); }

  async function revise() {
    if (!context || !current || !evaluation || !issues.length) return setError("Chọn ít nhất một finding để chỉnh sửa.");
    if (!await requestAiConsent()) return;
    setBusy(true); setError("");
    try {
      const result = await askWritingModel<{ revisedText?: unknown; rationale?: unknown }>(context, [
        { role: "system", content: "Revise a scientific paragraph only to address selected issues. Preserve the source claim, evidence, numbers, citations, negation, hedging, modality and certainty. Do not add facts. Return JSON with revisedText and rationale." },
        { role: "user", content: JSON.stringify({ sourceText: evaluation.sourceText, selectedIssues: issues }) },
      ]);
      if (typeof result.revisedText !== "string" || !result.revisedText.trim()) throw new Error("Model không trả về bản sửa hợp lệ.");
      const meaningCheck = compareMeaning(evaluation.sourceText, result.revisedText);
      const next: Revision = { evaluationId: current.record.id, sourceText: evaluation.sourceText, revisedText: result.revisedText,
        selectedIssueIds: selectedIssues, rationale: typeof result.rationale === "string" ? result.rationale : "", meaningCheck,
        status: meaningCheck.missingEvidence.length ? "needs_evidence" : "proposed", accepted: false };
      const record = newWritingRecord("revision", `Revision · ${current.record.title}`, next);
      const version = await writingRepository.save(context, record, null);
      setRevision(next); setSaved({ record, version: version.version });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được bản sửa."); }
    finally { setBusy(false); }
  }

  async function acceptRevision() {
    if (!context || !saved || !revision) return;
    const nextRevision = { ...revision, status: "accepted" as const, accepted: true };
    const record = { ...saved.record, payload: nextRevision, updatedAt: new Date().toISOString() };
    try { const result = await writingRepository.save(context, record, saved.version); setSaved({ record, version: result.version }); setRevision(nextRevision); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được quyết định duyệt."); }
  }

  const diff = revision ? diffWords(revision.sourceText, revision.revisedText) : [];
  return <div className="tool-page">
    <header className="tool-header"><div><p className="eyebrow">REVISE · PARAGRAPH 02</p><h1>Chỉnh sửa có kiểm soát</h1><p>Bản gốc không đổi; bản sửa luôn là một record riêng.</p></div><span className="badge">REVIEW BEFORE REPLACE</span></header>
    <section className="panel"><h2>Chọn phân tích nguồn</h2>{loadingEvaluations ? <div className="revise-loading-state" role="status" aria-live="polite" aria-busy="true">
      <span className="revise-state-icon is-loading"><LoaderCircle size={19} aria-hidden="true" /></span><div className="revise-state-copy"><strong>Đang tải đánh giá</strong><p>Đang tìm các paragraph đã đánh giá trong project này…</p><div className="revise-skeleton-lines" aria-hidden="true"><i /><i /></div></div>
    </div> : evaluations.length ? <Select ariaLabel="Chọn phân tích nguồn" placeholder="Chọn một evaluation…" value={selectedId}
      options={evaluations.map((item) => ({ value: item.record.id, label: `${item.record.title} · ${new Date(item.record.createdAt).toLocaleDateString()}` }))}
      onValueChange={(value) => { setSelectedId(value); setSelectedIssues([]); setRevision(null); }} /> : !error && <div className="revise-empty-state">
        <span className="revise-state-icon"><FileText size={19} aria-hidden="true" /></span><div className="revise-state-copy"><strong>Chưa có đánh giá để chỉnh sửa</strong><p>Đánh giá một paragraph trước. Các findings sẽ xuất hiện tại đây để bạn chọn và duyệt từng thay đổi.</p></div>
        <Link className="primary-button revise-empty-action" href="/evaluate"> <ClipboardCheck size={15} aria-hidden="true" />Đánh giá paragraph<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>}
      {evaluation && <><label className="field-label">Chọn vấn đề cần xử lý</label><div className="result-list">{evaluation.issues.map((issue) => <label key={issue.id} className="checkbox-row issue-select"><input type="checkbox" checked={selectedIssues.includes(issue.id)} onChange={() => toggleIssue(issue.id)} /><span className="issue-select-content"><b className="issue-select-title">{issue.type.replaceAll("_", " ")}</b><small className="issue-select-quote">{issue.quote}</small><small className="issue-select-rationale">{issue.rationale}</small></span></label>)}</div><button className="primary-button revise-submit" onClick={() => void revise()} disabled={busy || selectedIssues.length === 0}>{busy ? "Đang tạo bản sửa…" : `Tạo bản sửa cho ${selectedIssues.length} finding`}</button></>}{error && <p className="error-note" role="alert">{error}</p>}</section>
    {revision && <section className="panel revision-result"><div className="section-title"><div><p className="eyebrow">REVISION PROPOSAL</p><h2>Bản đề xuất</h2></div><span className={revision.meaningCheck.passed ? "badge" : "badge warning"}>{revision.meaningCheck.passed ? "Kiểm tra tự động không thấy mất marker" : "Cần người viết kiểm tra"}</span></div>
      <div className="diff-text">{diff.map((part, index) => <span key={`${index}-${part.value}`} className={part.type === "added" ? "diff-added" : part.type === "removed" ? "diff-removed" : undefined}>{part.value}</span>)}</div>
      <p className="hint">{revision.rationale}</p>{revision.meaningCheck.missingEvidence.length > 0 && <p className="error-note">Thiếu số liệu/trích dẫn từ bản gốc: {revision.meaningCheck.missingEvidence.join(", ")}. Đánh dấu là needs_evidence và không chấp nhận tự động.</p>}
      {revision.accepted ? <p className="success-note">Bạn đã duyệt bản sửa. Bản gốc vẫn được giữ nguyên.</p> : <div className="button-row"><button className="primary-button" onClick={() => void acceptRevision()} disabled={revision.status === "needs_evidence"}>Duyệt bản sửa</button><Link className="secondary-button" href={`/compare?before=${encodeURIComponent(revision.evaluationId)}&after=${encodeURIComponent(saved?.record.id ?? "")}`}>So sánh trước / sau</Link></div>}
    </section>}
  </div>;
}

function isEvaluation(value: unknown): value is Evaluation { return !!value && typeof value === "object" && "sourceText" in value && "issues" in value && Array.isArray(value.issues); }
