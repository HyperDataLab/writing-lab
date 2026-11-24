const NUMBER_OR_CITATION = /(?:\b\d+(?:\.\d+)?\b|\[[0-9]+\]|\([A-Z][A-Za-z-]+(?:\s+et\s+al\.)?,?\s*\d{4}\))/g;
const MEANING_MARKERS = /\b(?:not|no|never|without|may|might|could|possibly|suggests?|indicates?|appears?)\b/gi;

export type MeaningCheck = { passed: boolean; missingEvidence: string[]; markersBefore: string[]; markersAfter: string[] };
export function unsupportedFacts(text: string, evidence: string) {
  const facts: string[] = Array.from(text.match(NUMBER_OR_CITATION) ?? []);
  const sourceFacts: string[] = Array.from(evidence.match(NUMBER_OR_CITATION) ?? []);
  return facts.filter((fact) => !sourceFacts.includes(fact));
}

export function compareMeaning(source: string, revision: string): MeaningCheck {
  const sourceFacts: string[] = Array.from(source.match(NUMBER_OR_CITATION) ?? []);
  const revisionFacts: string[] = Array.from(revision.match(NUMBER_OR_CITATION) ?? []);
  const missingEvidence = sourceFacts.filter((fact) => !revisionFacts.includes(fact));
  const markersBefore: string[] = Array.from(source.match(MEANING_MARKERS) ?? []);
  const markersAfter: string[] = Array.from(revision.match(MEANING_MARKERS) ?? []);
  const lostMarkers = markersBefore.filter((marker) => !markersAfter.some((next) => next.toLowerCase() === marker.toLowerCase()));
  return { passed: missingEvidence.length === 0 && lostMarkers.length === 0, missingEvidence, markersBefore, markersAfter };
}

export function diffWords(before: string, after: string) {
  const left = before.split(/(\s+)/);
  const right = after.split(/(\s+)/);
  const lcs = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
    const row = lcs[i];
    if (row) row[j] = left[i] === right[j] ? (lcs[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i]?.[j + 1] ?? 0);
  }
  const result: Array<{ value: string; type: "same" | "added" | "removed" }> = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { result.push({ value: left[i] ?? "", type: "same" }); i++; j++; }
    else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) { result.push({ value: left[i] ?? "", type: "removed" }); i++; }
    else { result.push({ value: right[j] ?? "", type: "added" }); j++; }
  }
  while (i < left.length) { result.push({ value: left[i] ?? "", type: "removed" }); i++; }
  while (j < right.length) { result.push({ value: right[j] ?? "", type: "added" }); j++; }
  return result;
}
