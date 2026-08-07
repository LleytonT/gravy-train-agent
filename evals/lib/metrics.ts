import type { ExtractedSignal } from "../../agent/lib/classify.js";
import {
  companyMatches,
  normalizeSignalType,
} from "./report.js";

export type ClassifyExpected = {
  mustExtract: boolean;
  companiesAnyOf?: string[];
  signalTypesAnyOf?: string[];
  direction?: "positive" | "negative";
  minStrength?: number;
  maxSignals?: number;
};

export type CaseScore = {
  id: string;
  ok: boolean;
  reasons: string[];
  predictedCount: number;
};

export function scoreClassifyCase(
  id: string,
  predicted: ExtractedSignal[],
  expected: ClassifyExpected,
): CaseScore {
  const reasons: string[] = [];

  if (expected.maxSignals !== undefined && predicted.length > expected.maxSignals) {
    reasons.push(
      `expected at most ${expected.maxSignals} signals, got ${predicted.length}`,
    );
  }

  if (!expected.mustExtract) {
    const ok = reasons.length === 0 && predicted.length === 0;
    if (!ok && predicted.length > 0) {
      reasons.push(
        `noise item produced signals: ${predicted
          .map((s) => s.signalType)
          .join(", ")}`,
      );
    }
    return {
      id,
      ok: reasons.length === 0,
      reasons,
      predictedCount: predicted.length,
    };
  }

  if (predicted.length === 0) {
    reasons.push("expected at least one signal, got none");
    return { id, ok: false, reasons, predictedCount: 0 };
  }

  if (expected.companiesAnyOf?.length) {
    const hit = predicted.some((signal) =>
      companyMatches(signal.company, expected.companiesAnyOf!),
    );
    if (!hit) {
      reasons.push(
        `company miss — got [${predicted.map((s) => s.company).join(", ")}], wanted one of [${expected.companiesAnyOf.join(", ")}]`,
      );
    }
  }

  if (expected.signalTypesAnyOf?.length) {
    const allowed = new Set(
      expected.signalTypesAnyOf.map(normalizeSignalType),
    );
    const hit = predicted.some((signal) =>
      allowed.has(normalizeSignalType(signal.signalType)),
    );
    if (!hit) {
      reasons.push(
        `signalType miss — got [${predicted.map((s) => s.signalType).join(", ")}], wanted one of [${expected.signalTypesAnyOf.join(", ")}]`,
      );
    }
  }

  if (expected.direction) {
    const hit = predicted.some(
      (signal) => signal.direction === expected.direction,
    );
    if (!hit) {
      reasons.push(
        `direction miss — expected ${expected.direction}, got [${predicted
          .map((s) => s.direction)
          .join(", ")}]`,
      );
    }
  }

  if (expected.minStrength !== undefined) {
    const hit = predicted.some(
      (signal) => signal.strength >= expected.minStrength!,
    );
    if (!hit) {
      reasons.push(
        `strength miss — expected >= ${expected.minStrength}, got [${predicted
          .map((s) => s.strength)
          .join(", ")}]`,
      );
    }
  }

  return {
    id,
    ok: reasons.length === 0,
    reasons,
    predictedCount: predicted.length,
  };
}

export function precisionRecall(
  scores: CaseScore[],
): { precision: number; recall: number; accuracy: number } {
  const extractCases = scores.filter((s) => s.predictedCount > 0 || !s.ok);
  // For this harness: accuracy = fraction of gold cases that fully pass.
  const accuracy =
    scores.length === 0
      ? 0
      : scores.filter((s) => s.ok).length / scores.length;

  // Treat must-extract passes as true positives for a coarse recall proxy.
  const mustExtractIds = new Set(
    scores.filter((s) => s.predictedCount > 0 || s.ok).map((s) => s.id),
  );
  void mustExtractIds;
  void extractCases;

  const passed = scores.filter((s) => s.ok).length;
  const predictedPositive = scores.filter((s) => s.predictedCount > 0).length;
  const precision =
    predictedPositive === 0 ? 0 : passed / Math.max(predictedPositive, passed);
  const recall = scores.length === 0 ? 0 : passed / scores.length;

  return { precision, recall, accuracy };
}
