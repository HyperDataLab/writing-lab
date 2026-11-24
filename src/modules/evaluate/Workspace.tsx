"use client";

import Link from "next/link";
import { FormEvent, useState, type ReactNode } from "react";
import { Check, ClipboardCheck, ClipboardPaste, FileText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { evaluationPrompt, hashText, normalizeEvaluation, type Evaluation, type WritingIssue } from "@/core/writing/evaluate";
import { askWritingModel, readLlmSettings } from "@/shared/llm/settings";
import { useAiConsent } from "@/shared/llm/AiConsentProvider";
import { newWritingRecord, writingRepository, type WritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

type VersionedRecord = { record: WritingRecord; version: string };
const extractModelResult = (value: unknown) => value && typeof value === "object" ? value as Parameters<typeof normalizeEvaluation>[1] : {};
function annotatedSource(text: string, issues: WritingIssue[]) {
  const spans = issues.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const issue of spans) {
    if (issue.start < cursor || issue.end > text.length || issue.start >= issue.end || text.slice(issue.start, issue.end) !== issue.quote) continue;
    if (issue.start > cursor) parts.push(text.slice(cursor, issue.start));
    parts.push(<mark className={`source-mark source-mark-${issue.status}`} title={`${issue.type}: ${issue.rationale}`} key={issue.id}>{text.slice(issue.start, issue.end)}</mark>);
    cursor = issue.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function EvaluateWorkspace() {
  const context = useWritingContext();
  const requestAiConsent = useAiConsent();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Evaluation | null>(null);
  const [saved, setSaved] = useState<VersionedRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!context) return setError("Project ResearchHub chưa sẵn sàng.");
    if (!text.trim()) return setError("Nhập một paragraph để đánh giá.");
    if (text.trim().split(/\n\s*\n/).length > 1) return setError("Mỗi lần chỉ đánh giá một paragraph. Hãy tách các đoạn trước khi tiếp tục.");
    if (new TextEncoder().encode(text).byteLength > 100_000) return setError("Giới hạn phân tích là 100 KB cho mỗi paragraph.");
    if (!await requestAiConsent()) return;
    setBusy(true);
    try {
      const settings = readLlmSettings();
      const modelResult = await askWritingModel<unknown>(context, [
        { role: "system", content: "You are a cautious academic-writing evaluator. Return the requested JSON object only. Treat style signals as candidates, not errors. Never fabricate quotations or evidence." },
        { role: "user", content: evaluationPrompt(text) },
      ]);
      const now = new Date().toISOString();
      const evaluation = normalizeEvaluation(text, extractModelResult(modelResult), settings.model, await hashText(text), now);
      const record = newWritingRecord("evaluation", text.trim().split(/\s+/).slice(0, 9).join(" "), evaluation);
      const { version } = await writingRepository.get(context, record.id) ?? { version: null };
      const savedVersion = await writingRepository.save(context, record, version);
      setResult(evaluation); setSaved({ record, version: savedVersion.version });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không đánh giá được paragraph."); }
    finally { setBusy(false); }
  }

  async function decide(issueId: string, status: WritingIssue["status"]) {
    if (!context || !saved || !result) return;
    const nextResult = { ...result, issues: result.issues.map((issue) => issue.id === issueId ? { ...issue, status } : issue) };
    const nextRecord = { ...saved.record, updatedAt: new Date().toISOString(), payload: nextResult };
    try {
      const nextVersion = await writingRepository.save(context, nextRecord, saved.version);
      setResult(nextResult); setSaved({ record: nextRecord, version: nextVersion.version });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được quyết định."); }
  }

  async function pasteText() {
    setError("");
    try {
      const pasted = await navigator.clipboard.readText();
      if (pasted) { setText(pasted); setResult(null); setSaved(null); }
    } catch { setError("Không thể đọc clipboard. Hãy dán văn bản trực tiếp vào vùng nhập."); }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const byteCount = new TextEncoder().encode(text).length;

  return <div className="tool-page">
    <header className="evaluate-page-header">
      <div className="evaluate-title-wrap"><span className="evaluate-title-icon"><ClipboardCheck size={21} strokeWidth={1.8} /></span><div><p className="eyebrow">WRITING WORKSPACE <span>·</span> ĐÁNH GIÁ</p><h1>Đánh giá paragraph</h1><p>Rà soát một đoạn học thuật với nhận xét được neo vào văn bản gốc.</p></div></div>
      <span className="evaluate-ai-status"><span aria-hidden="true" />AI hỗ trợ · bạn quyết định</span>
    </header>
    <div className="evaluate-layout">
      <form className="panel evaluate-editor" onSubmit={(event) => void analyze(event)}>
        <div className="evaluate-editor-heading"><div><h2>Văn bản cần đánh giá</h2><p>Dán một paragraph để bắt đầu. Bản gốc luôn được giữ nguyên.</p></div><div className="evaluate-editor-tools"><button className="secondary-button" type="button" onClick={() => void pasteText()} disabled={busy}><ClipboardPaste size={15} />Dán văn bản</button>{text && <button className="icon-text-button" type="button" onClick={() => { setText(""); setResult(null); setSaved(null); setError(""); }} disabled={busy}><Trash2 size={15} />Xóa</button>}</div></div>
        <label className="field-label evaluate-field-label" htmlFor="source-text">Nội dung paragraph</label>
        <textarea id="source-text" className="text-area large evaluate-text-area" value={text} onChange={(event) => { setText(event.target.value); setResult(null); setSaved(null); setError(""); }} placeholder="Dán đoạn văn học thuật tại đây…" maxLength={100_000} aria-describedby="source-guidance source-count" disabled={busy} />
        <div className="evaluate-editor-meta" id="source-guidance"><span><ShieldCheck size={15} />Nguồn được giữ nguyên; findings cần khớp trích dẫn chính xác.</span><span id="source-count">{wordCount.toLocaleString()} từ <i /> {byteCount.toLocaleString()} / 100,000 bytes</span></div>
        {error && <p className="error-note evaluate-error" role="alert">{error}</p>}
        <div className="evaluate-submit-row"><p><FileText size={15} />Một lần đánh giá cho một paragraph</p><button className="primary-button evaluate-submit" disabled={busy || !text.trim()} aria-busy={busy}><Sparkles size={16} />{busy ? "Đang đánh giá…" : "Đánh giá paragraph"}</button></div>
      </form>
      <aside className="panel evaluate-results" aria-live="polite">
        <div className="evaluate-results-heading"><div><h2>Kết quả đánh giá</h2><p>{result ? "Nhận xét được đối chiếu với nguồn." : "Bản đánh giá sẽ xuất hiện tại đây."}</p></div><span className={result ? "evaluate-result-icon is-ready" : "evaluate-result-icon"}><ClipboardCheck size={18} /></span></div>
        {!result ? <div className="evaluate-empty-result">
          <div className="evaluate-empty-copy"><span className="evaluate-empty-symbol"><Sparkles size={18} /></span><div><strong>Sẵn sàng phân tích</strong><p>Nhận diện điểm cần xem lại và vị trí tương ứng trong đoạn văn.</p></div></div>
          <div className="evaluate-steps"><div><span>1</span><p><strong>Đọc theo ngữ cảnh</strong><small>Đánh giá luận điểm, bằng chứng và cách diễn đạt.</small></p></div><div><span>2</span><p><strong>Neo vào câu gốc</strong><small>Mỗi phát hiện cần trích dẫn khớp với nguồn.</small></p></div><div><span>3</span><p><strong>Bạn duyệt kết quả</strong><small>Đề xuất không tự sửa hoặc thay thế văn bản.</small></p></div></div>
          <div className="evaluate-privacy-note"><ShieldCheck size={15} /><span>Chỉ gửi nội dung tới AI sau khi bạn xác nhận.</span></div>
        </div> : <>
          <div className="evaluate-score-grid"><div><strong>{result.overallScore ?? "—"}</strong><span>Điểm tổng / 100</span></div><div><strong>{Math.round(result.coverage * 100)}%</strong><span>Độ bao phủ</span></div></div>
          <div className="evaluate-metrics"><span>{result.metrics.wordCount} từ</span><i /><span>{result.metrics.sentenceCount} câu</span><i /><span>{result.issues.length} phát hiện</span></div>
          {result.overallScore === null && <p className="hint">Chưa đủ căn cứ để tính điểm tổng.</p>}
          <h3 className="subheading">Các chiều đánh giá</h3><div className="result-list">{result.dimensionScores.map((item) => <div className="result-card" key={item.id}><strong>{item.id.replaceAll("_", " ")}</strong><span className="dimension-score">{item.score === null ? "Chưa đủ căn cứ" : `${item.score}/100`}</span><p>{item.rationale || "Không có giải thích cho chiều này."}</p></div>)}</div>
        </>}
      </aside>
    </div>
    {result && <section className="panel source-annotation"><div className="section-title"><div><p className="eyebrow">NGUỒN ĐÃ ĐỐI CHIẾU</p><h2>Paragraph có đánh dấu</h2></div><span className="hint">Các vùng đánh dấu dùng trích dẫn khớp chính xác</span></div><p className="report-text">{annotatedSource(result.sourceText, result.issues)}</p></section>}
    {result && <section className="panel findings-panel"><div className="section-title"><div><p className="eyebrow">CẦN NGƯỜI VIẾT DUYỆT</p><h2>Phát hiện cần xem lại <span className="quiet-count">{result.issues.length}</span></h2></div>{saved && <div className="button-row"><Link className="secondary-button" href={`/revise?evaluationId=${encodeURIComponent(saved.record.id)}`}>Chỉnh sửa issues đã chọn</Link><Link className="secondary-button" href={`/report?id=${encodeURIComponent(saved.record.id)}`}>Báo cáo</Link></div>}</div>
      {result.issues.length === 0 ? <p className="hint">Không có phát hiện nào được neo chính xác vào văn bản nguồn.</p> : <div className="result-list">{result.issues.map((issue) => <article className="result-card issue-card" key={issue.id}><div className="issue-heading"><strong>{issue.type.replaceAll("_", " ")}</strong><span className="badge">{issue.severity} · {Math.round(issue.confidence * 100)}%</span></div><blockquote>{issue.quote}</blockquote><p>{issue.rationale}</p>{issue.suggestion && <p><b>Gợi ý:</b> {issue.suggestion}</p>}<div className="button-row"><button className={issue.status === "confirmed_by_human" ? "primary-button" : "secondary-button"} onClick={() => void decide(issue.id, "confirmed_by_human")}><Check size={14} />Giữ lại finding</button><button className={issue.status === "dismissed_by_human" ? "primary-button" : "secondary-button"} onClick={() => void decide(issue.id, "dismissed_by_human")}>Bỏ qua</button><span className="badge">{issue.status.replaceAll("_", " ")}</span></div></article>)}</div>}
    </section>}
    <p className="disclaimer">Điểm và ngưỡng là operationalization của sản phẩm, chưa được hiệu chuẩn để dùng cho quyết định học thuật hệ trọng.</p>
  </div>;
}
