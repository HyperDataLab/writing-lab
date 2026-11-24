"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Select } from "@/shared/ui/Select";
import { writingRepository, newWritingRecord, type VersionedWritingRecord, type WritingRecord } from "@/shared/storage/writingRepository";
import { useWritingContext } from "@/modules/shared/useWritingContext";

type Evaluation = { sourceText: string; dimensionScores: Array<{ id: string; score: number | null }> };
const dimensions = ["sentence_structure", "flow_coherence", "precision", "conciseness", "academic_style"];

export function CalibrationWorkspace() {
  const context = useWritingContext();
  const search = useSearchParams();
  const [records, setRecords] = useState<VersionedWritingRecord[]>([]);
  const [selectedId, setSelectedId] = useState(search.get("evaluationId") ?? "");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<WritingRecord | null>(null);

  useEffect(() => {
    if (!context) return;
    void writingRepository.listRecords(context).then((items) => setRecords(items.filter((item) => item.record.kind === "evaluation" && isEvaluation(item.record.payload))))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Không tải được kết quả đánh giá."));
  }, [context]);

  const selected = records.find((item) => item.record.id === selectedId);
  const evaluation = selected?.record.payload as Evaluation | undefined;
  async function saveCalibration() {
    if (!context || !selected || !evaluation) return setError("Chọn kết quả Evaluate trước.");
    if (dimensions.some((id) => !scores[id] || Number(scores[id]) < 0 || Number(scores[id]) > 4)) return setError("Chấm đủ năm chiều từ 0 đến 4.");
    const humanScores = Object.fromEntries(dimensions.map((id) => [id, Number(scores[id])]));
    const disagreements = dimensions.filter((id) => {
      const machineScore = evaluation.dimensionScores.find((item) => item.id === id)?.score;
      return machineScore !== null && machineScore !== undefined && Math.abs(machineScore - (humanScores[id] ?? 0) * 25) >= 25;
    });
    const payload = { format: "writing-lab-calibration", schemaVersion: 1, evaluationId: selectedId, sourceHash: (evaluation as Evaluation & { sourceHash?: string }).sourceHash ?? null,
      humanScores, machineScores: evaluation.dimensionScores, disagreements, notes: notes.trim(), createdAt: new Date().toISOString() };
    const record = newWritingRecord("calibration", `Calibration · ${selected.record.title}`, payload);
    try { await writingRepository.save(context, record, null); setSaved(record); setStatus(`Đã lưu nhãn người đánh giá; ${disagreements.length} chiều có chênh lệch đáng kể.`); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được calibration."); }
  }

  return <div className="tool-page"><header className="tool-header"><div><p className="eyebrow">CALIBRATION · HUMAN REVIEW</p><h1>Hiệu chuẩn</h1><p>Lưu điểm của người đánh giá và giữ lại trường hợp bất đồng với model.</p></div><span className="badge">HUMAN LABELS</span></header>
    <section className="panel"><h2>Chọn kết quả và chấm theo rubric</h2>{records.length ? <Select ariaLabel="Chọn kết quả đánh giá" placeholder="Chọn một evaluation…" value={selectedId}
      options={records.map((item) => ({ value: item.record.id, label: `${item.record.title} · ${new Date(item.record.createdAt).toLocaleDateString()}` }))}
      onValueChange={(value) => { setSelectedId(value); setSaved(null); setStatus(""); }} /> : <p className="hint">Chưa có evaluation để hiệu chuẩn.</p>}
      {evaluation && <><div className="privacy-box"><b>Văn bản nguồn</b><p>{evaluation.sourceText}</p></div><div className="calibration-grid">{dimensions.map((id) => <label key={id}><span className="field-label">{id.replaceAll("_", " ")} <small>(AI: {evaluation.dimensionScores.find((item) => item.id === id)?.score ?? "—"}/100)</small></span><Select ariaLabel={`Điểm ${id.replaceAll("_", " ")}`} placeholder="Chọn điểm" value={scores[id] ?? ""} options={[0,1,2,3,4].map((score) => ({ value: String(score), label: `${score} · ${description[score]}` }))} onValueChange={(next) => setScores((value) => ({ ...value, [id]: next }))} /></label>)}</div><label className="field-label" htmlFor="calibration-notes">Ghi chú bất đồng / căn cứ</label><textarea id="calibration-notes" className="text-area" value={notes} onChange={(event) => setNotes(event.target.value)} />{error && <p className="error-note">{error}</p>}{status && <p className="success-note">{status}</p>}<button className="primary-button" onClick={() => void saveCalibration()}>Lưu nhãn hiệu chuẩn</button></>}
      {saved && <p className="hint">Calibration record ID: {saved.id}</p>}
    </section>
  </div>;
}
const description = ["Không hỗ trợ", "Vấn đề lớn", "Chưa đồng đều", "Tốt", "Rất hiệu quả"];
function isEvaluation(value: unknown): value is Evaluation { return !!value && typeof value === "object" && "sourceText" in value && Array.isArray((value as Evaluation).dimensionScores); }
