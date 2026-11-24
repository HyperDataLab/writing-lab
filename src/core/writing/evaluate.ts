import { evaluationSchema, type EvaluationDocument } from "@/core/schemas/writing";

export type WritingIssue = {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  status: "candidate" | "confirmed_by_human" | "dismissed_by_human";
  quote: string;
  start: number;
  end: number;
  rationale: string;
  suggestion: string;
  confidence: number;
};

export type DimensionScore = { id: string; score: number | null; confidence: number; applicable: boolean; rationale: string };
export type Evaluation = {
  format: "writing-lab-evaluation";
  schemaVersion: 1;
  createdAt: string;
  sourceText: string;
  sourceHash: string;
  metrics: { wordCount: number; sentenceCount: number; meanSentenceLength: number; metricsVersion: "writing-metrics-1" };
  overallScore: number | null;
  dimensionScores: DimensionScore[];
  confidence: number;
  coverage: number;
  contextLimited: boolean;
  issues: WritingIssue[];
  model: string;
  promptVersion: string;
};

type ModelResult = {
  dimensions?: Array<{ id?: unknown; score?: unknown; confidence?: unknown; applicable?: unknown; rationale?: unknown }>;
  confidence?: unknown;
  coverage?: unknown;
  contextLimited?: unknown;
  issues?: Array<{ type?: unknown; severity?: unknown; quote?: unknown; occurrence?: unknown; rationale?: unknown; suggestion?: unknown; confidence?: unknown }>;
};

const PROMPT_VERSION = "writing-evaluate-1";
const DIMENSIONS = ["sentence_structure", "flow_coherence", "precision", "conciseness", "academic_style"] as const;
const clamp01 = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
const score100 = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 4 ? Math.round(value * 25) : null;

function anchor(source: string, quote: string, occurrence: number) {
  if (!quote.trim()) return null;
  let cursor = 0;
  for (let i = 0; i <= occurrence; i++) {
    const found = source.indexOf(quote, cursor);
    if (found < 0) return null;
    if (i === occurrence) return { start: found, end: found + quote.length };
    cursor = found + quote.length;
  }
  return null;
}

export async function hashText(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function evaluationPrompt(text: string) {
  return `Evaluate this single scientific paragraph. Return only JSON with dimensions (id, score 0-4 or null, confidence 0-1, applicable boolean, rationale), confidence, coverage 0-1, contextLimited boolean, and issues (type, severity low/medium/high, quote copied exactly from source, occurrence zero-based among exact occurrences, rationale, suggestion, confidence). Dimensions: ${DIMENSIONS.join(", ")}. Detect review candidates, not automatic violations. Do not deduct scores from counts alone. Passive voice, adjectives, adverbs and long sentences are not violations by themselves. Do not invent text or spans. Scores need evidence and uncertainty. If 2 or more dimensions are unassessable, use null for overallScore (do not return one). Text:\n${text}`;
}

export function normalizeEvaluation(sourceText: string, value: ModelResult, model: string, sourceHash: string, createdAt: string): Evaluation {
  const dimensions = DIMENSIONS.map((id) => {
    const item = value.dimensions?.find((entry) => entry.id === id);
    const applicable = item?.applicable !== false && item?.score !== null;
    return { id, score: applicable ? score100(item?.score) : null, confidence: clamp01(item?.confidence), applicable,
      rationale: typeof item?.rationale === "string" ? item.rationale.slice(0, 1000) : "" };
  });
  const assessable = dimensions.filter((item) => item.applicable && item.score !== null);
  const coverage = clamp01(value.coverage);
  const overallScore = assessable.length >= DIMENSIONS.length - 1 && coverage >= 0.5
    ? Math.round(assessable.reduce((sum, item) => sum + (item.score ?? 0), 0) / assessable.length)
    : null;
  const issues: WritingIssue[] = (value.issues ?? []).flatMap((issue, index) => {
    if (typeof issue.quote !== "string" || typeof issue.rationale !== "string") return [];
    const occurrence = typeof issue.occurrence === "number" && Number.isInteger(issue.occurrence) && issue.occurrence >= 0 ? issue.occurrence : 0;
    if (typeof issue.occurrence !== "number" && sourceText.indexOf(issue.quote) !== sourceText.lastIndexOf(issue.quote)) return [];
    const span = anchor(sourceText, issue.quote, occurrence);
    if (!span) return [];
    const severity = issue.severity === "high" || issue.severity === "medium" ? issue.severity : "low";
    return [{ id: `issue-${index + 1}`, type: typeof issue.type === "string" ? issue.type.slice(0, 80) : "review_candidate", severity,
      status: "candidate" as const, quote: issue.quote, ...span, rationale: issue.rationale.slice(0, 1200),
      suggestion: typeof issue.suggestion === "string" ? issue.suggestion.slice(0, 1200) : "", confidence: clamp01(issue.confidence) }];
  });
  const words = sourceText.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const sentences = sourceText.match(/[^.!?]+(?:[.!?]+|$)/gu)?.map((part) => part.trim()).filter(Boolean) ?? (sourceText.trim() ? [sourceText.trim()] : []);
  const document: EvaluationDocument = { format: "writing-lab-evaluation", schemaVersion: 1, createdAt, sourceText, sourceHash,
    metrics: { wordCount: words.length, sentenceCount: sentences.length, meanSentenceLength: sentences.length ? Math.round(words.length / sentences.length * 10) / 10 : 0, metricsVersion: "writing-metrics-1" as const },
    overallScore, dimensionScores: dimensions, confidence: clamp01(value.confidence), coverage,
    contextLimited: value.contextLimited === true, issues, model, promptVersion: PROMPT_VERSION };
  return evaluationSchema.parse(document);
}
