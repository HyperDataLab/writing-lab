"use client";

import { useState } from "react";
import { askWritingModel } from "@/shared/llm/settings";
import { useAiConsent } from "@/shared/llm/AiConsentProvider";
import { Select } from "@/shared/ui/Select";
import { unsupportedFacts } from "@/core/writing/safety";
import { newWritingRecord, writingRepository, type WritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

type Claim = { statement: string; evidenceQuote: string; anchored: boolean };
type Generation = { format: "writing-lab-generation"; schemaVersion: 1; claim: string; evidence: string; audience: string; purpose: string; paragraph: string; claims: Claim[]; unsupportedClaims: string[]; accepted: boolean; createdAt: string };

function exactEvidenceQuote(evidence: string, quote: string) { return quote.trim().length > 0 && evidence.includes(quote); }

export function GenerateWorkspace() {
  const context = useWritingContext();
  const requestAiConsent = useAiConsent();
  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState("");
  const [audience, setAudience] = useState("Researchers in the field");
  const [purpose, setPurpose] = useState("Results paragraph");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [saved, setSaved] = useState<{ record: WritingRecord; version: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setError("");
    if (!context) return setError("Project ResearchHub chưa sẵn sàng.");
    if (!claim.trim() || !evidence.trim()) return setError("Cung cấp claim và evidence trước khi soạn.");
    if (!await requestAiConsent()) return;
    setBusy(true);
    try {
      const result = await askWritingModel<{ paragraph?: unknown; claims?: unknown; unsupportedClaims?: unknown }>(context, [
        { role: "system", content: "Write one concise scientific paragraph using only the supplied claim and evidence. Preserve uncertainty and citations. Do not invent facts, numbers or references. Return JSON: paragraph, claims (statement and exact evidenceQuote), unsupportedClaims. Any statement without a verbatim supporting quote must be listed as unsupported." },
        { role: "user", content: JSON.stringify({ claim, evidence, audience, purpose }) },
      ]);
      if (typeof result.paragraph !== "string" || !result.paragraph.trim()) throw new Error("Model không trả về paragraph hợp lệ.");
      const claims = Array.isArray(result.claims) ? result.claims.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as { statement?: unknown; evidenceQuote?: unknown };
        if (typeof item.statement !== "string" || typeof item.evidenceQuote !== "string") return [];
        return [{ statement: item.statement, evidenceQuote: item.evidenceQuote, anchored: exactEvidenceQuote(evidence, item.evidenceQuote) }];
      }) : [];
      const unsupportedClaims = [
        ...(Array.isArray(result.unsupportedClaims) ? result.unsupportedClaims.filter((item): item is string => typeof item === "string") : []),
        ...claims.filter((item) => !item.anchored).map((item) => item.statement),
        ...unsupportedFacts(result.paragraph, evidence).map((item) => `Số liệu hoặc citation không có trong evidence: ${item}`),
      ];
      const data: Generation = { format: "writing-lab-generation", schemaVersion: 1, claim, evidence, audience, purpose, paragraph: result.paragraph,
        claims, unsupportedClaims: [...new Set(unsupportedClaims)], accepted: false, createdAt: new Date().toISOString() };
      const record = newWritingRecord("generation", `Draft · ${claim.slice(0, 65)}`, data);
      const resultVersion = await writingRepository.save(context, record, null);
      setGeneration(data); setSaved({ record, version: resultVersion.version });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không soạn được paragraph."); }
    finally { setBusy(false); }
  }

  async function accept() {
    if (!context || !saved || !generation) return;
    if (generation.unsupportedClaims.length) return setError("Cần xử lý các claim chưa có evidence được neo trước khi duyệt.");
    const next = { ...generation, accepted: true };
    const record = { ...saved.record, updatedAt: new Date().toISOString(), payload: next };
    try { const response = await writingRepository.save(context, record, saved.version); setSaved({ record, version: response.version }); setGeneration(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được trạng thái duyệt."); }
  }

  return <div className="tool-page">
    <header className="tool-header"><div><p className="eyebrow">GENERATE · PARAGRAPH 03</p><h1>Soạn từ claim &amp; evidence</h1><p>Mỗi nội dung phải truy được về nguồn do bạn cung cấp.</p></div><span className="badge">NO UNSUPPORTED FACTS</span></header>
    <div className="tool-layout"><section className="panel"><h2>Đầu vào</h2><label className="field-label" htmlFor="claim">Claim hoặc thông điệp chính</label><textarea id="claim" className="text-area" value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Nêu kết luận bạn muốn truyền đạt…" /><label className="field-label" htmlFor="evidence">Evidence, số liệu và citation</label><textarea id="evidence" className="text-area" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Dán bằng chứng mà paragraph được phép sử dụng…" /><div className="form-grid"><label><span className="field-label">Độc giả</span><input className="text-input" value={audience} onChange={(event) => setAudience(event.target.value)} /></label><div><span className="field-label">Mục đích</span><Select ariaLabel="Mục đích" value={purpose} options={[{ value: "Results paragraph", label: "Results paragraph" }, { value: "Methods paragraph", label: "Methods paragraph" }, { value: "Discussion paragraph", label: "Discussion paragraph" }, { value: "Abstract paragraph", label: "Abstract paragraph" }]} onValueChange={setPurpose} /></div></div>{error && <p className="error-note" role="alert">{error}</p>}<div className="button-row"><button className="primary-button" onClick={() => void generate()} disabled={busy}>{busy ? "Đang soạn…" : "Tạo bản nháp"}</button><span className="hint">Gửi nội dung tới AI chỉ sau khi bạn đồng ý.</span></div></section>
      <aside className="panel"><h2>Bản nháp</h2>{!generation ? <p className="hint">Paragraph mới sẽ được lưu thành record riêng, không ghi đè input.</p> : <><p className="generated-text">{generation.paragraph}</p><div className="result-list">{generation.claims.map((item, index) => <div className="result-card" key={`${index}-${item.statement}`}><strong>{item.anchored ? "Evidence đã neo" : "needs_evidence"}</strong><p>{item.statement}</p>{item.evidenceQuote && <blockquote>{item.evidenceQuote}</blockquote>}</div>)}</div>{generation.unsupportedClaims.length > 0 && <div className="error-note"><b>Chưa có nguồn đủ rõ:</b><ul>{generation.unsupportedClaims.map((item) => <li key={item}>{item}</li>)}</ul></div>}{generation.accepted ? <p className="success-note">Bạn đã duyệt bản nháp.</p> : <button className="primary-button" onClick={() => void accept()} disabled={generation.unsupportedClaims.length > 0}>Duyệt paragraph</button>}</>}</aside>
    </div>
  </div>;
}
