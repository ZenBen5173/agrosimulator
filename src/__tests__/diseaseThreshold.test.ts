import { describe, it, expect } from "vitest";

/**
 * Test disease detection confidence thresholds.
 * These are critical business logic rules from CLAUDE.md:
 * - >= 0.85: commit to diagnosis
 * - 0.60-0.84: uncertain, show best assessment + expert task
 * - < 0.60: no diagnosis, route to expert referral
 */

type DiagnosisOutcome = "confirmed" | "uncertain" | "cannot_determine";

function getOutcome(confidence: number): DiagnosisOutcome {
  if (confidence >= 0.85) return "confirmed";
  if (confidence >= 0.6) return "uncertain";
  return "cannot_determine";
}

function shouldReferToExpert(outcome: DiagnosisOutcome): boolean {
  return outcome === "cannot_determine";
}

function shouldCreateExpertTask(outcome: DiagnosisOutcome): boolean {
  return outcome === "uncertain";
}

function shouldShowTreatment(outcome: DiagnosisOutcome): boolean {
  return outcome === "confirmed" || outcome === "uncertain";
}

describe("Disease Detection Thresholds", () => {
  describe("getOutcome", () => {
    it("returns confirmed for confidence >= 0.85", () => {
      expect(getOutcome(0.85)).toBe("confirmed");
      expect(getOutcome(0.90)).toBe("confirmed");
      expect(getOutcome(1.0)).toBe("confirmed");
    });

    it("returns uncertain for confidence 0.60-0.84", () => {
      expect(getOutcome(0.60)).toBe("uncertain");
      expect(getOutcome(0.75)).toBe("uncertain");
      expect(getOutcome(0.84)).toBe("uncertain");
    });

    it("returns cannot_determine for confidence < 0.60", () => {
      expect(getOutcome(0.59)).toBe("cannot_determine");
      expect(getOutcome(0.30)).toBe("cannot_determine");
      expect(getOutcome(0)).toBe("cannot_determine");
    });

    it("handles exact boundary values correctly", () => {
      expect(getOutcome(0.85)).toBe("confirmed");
      expect(getOutcome(0.849)).toBe("uncertain");
      expect(getOutcome(0.60)).toBe("uncertain");
      expect(getOutcome(0.599)).toBe("cannot_determine");
    });
  });

  describe("Expert Referral Logic", () => {
    it("refers to expert only when cannot determine", () => {
      expect(shouldReferToExpert("cannot_determine")).toBe(true);
      expect(shouldReferToExpert("uncertain")).toBe(false);
      expect(shouldReferToExpert("confirmed")).toBe(false);
    });

    it("creates expert verification task for uncertain diagnoses", () => {
      expect(shouldCreateExpertTask("uncertain")).toBe(true);
      expect(shouldCreateExpertTask("confirmed")).toBe(false);
      expect(shouldCreateExpertTask("cannot_determine")).toBe(false);
    });

    it("shows treatment for confirmed and uncertain (not cannot_determine)", () => {
      expect(shouldShowTreatment("confirmed")).toBe(true);
      expect(shouldShowTreatment("uncertain")).toBe(true);
      expect(shouldShowTreatment("cannot_determine")).toBe(false);
    });
  });
});
