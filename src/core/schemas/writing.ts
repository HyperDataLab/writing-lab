import { z } from "zod";

export const writingKindSchema = z.enum(["evaluation", "revision", "generation", "calibration"]);
export const writingRecordSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  kind: writingKindSchema,
  title: z.string().max(300),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  schemaVersion: z.literal(1),
  payload: z.unknown(),
});
export type WritingKind = z.infer<typeof writingKindSchema>;
export type WritingRecord = z.infer<typeof writingRecordSchema>;

export const writingIssueSchema = z.strictObject({
  id: z.string(), type: z.string(), severity: z.enum(["low", "medium", "high"]),
  status: z.enum(["candidate", "confirmed_by_human", "dismissed_by_human"]),
  quote: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive(),
  rationale: z.string(), suggestion: z.string(), confidence: z.number().min(0).max(1),
});
export const dimensionScoreSchema = z.strictObject({
  id: z.string(), score: z.number().min(0).max(100).nullable(), confidence: z.number().min(0).max(1),
  applicable: z.boolean(), rationale: z.string(),
});
export const evaluationSchema = z.strictObject({
  format: z.literal("writing-lab-evaluation"), schemaVersion: z.literal(1), createdAt: z.string().datetime(),
  sourceText: z.string(), sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  metrics: z.strictObject({ wordCount: z.number().int().nonnegative(), sentenceCount: z.number().int().nonnegative(), meanSentenceLength: z.number().nonnegative(), metricsVersion: z.literal("writing-metrics-1") }),
  overallScore: z.number().min(0).max(100).nullable(), dimensionScores: z.array(dimensionScoreSchema), confidence: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1), contextLimited: z.boolean(), issues: z.array(writingIssueSchema), model: z.string(), promptVersion: z.string(),
});
export type EvaluationDocument = z.infer<typeof evaluationSchema>;
