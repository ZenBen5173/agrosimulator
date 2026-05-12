/**
 * Tests for the Pact group-buy pure logic.
 */

import { describe, it, expect } from "vitest";
import {
  validateCreateGroupBuy,
  savingsPerUnit,
  savingsPercent,
  deriveStatus,
  buildStatusForUi,
  buildSupplierQuoteMessage,
  type CreateGroupBuyInput,
} from "@/lib/pact/groupBuy";

function validInput(
  overrides: Partial<CreateGroupBuyInput> = {}
): CreateGroupBuyInput {
  return {
    initiatorUserId: "user-1",
    initiatorFarmId: "farm-1",
    district: "Cameron Highlands",
    itemName: "NPK 15-15-15",
    unit: "sack",
    individualPriceRm: 95,
    bulkPriceRm: 78,
    minParticipants: 5,
    closesAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("validateCreateGroupBuy", () => {
  it("accepts a valid input", () => {
    expect(validateCreateGroupBuy(validInput())).toEqual([]);
  });

  it("rejects empty item name", () => {
    const errs = validateCreateGroupBuy(validInput({ itemName: "  " }));
    expect(errs.find((e) => e.field === "itemName")).toBeDefined();
  });

  it("rejects bulk price equal to or higher than individual price", () => {
    const errs = validateCreateGroupBuy(
      validInput({ individualPriceRm: 50, bulkPriceRm: 60 })
    );
    expect(errs.find((e) => e.field === "bulkPriceRm")).toBeDefined();
  });

  it("rejects min participants below 2", () => {
    const errs = validateCreateGroupBuy(validInput({ minParticipants: 1 }));
    expect(errs.find((e) => e.field === "minParticipants")).toBeDefined();
  });

  it("rejects past closesAt", () => {
    const errs = validateCreateGroupBuy(
      validInput({ closesAt: new Date(Date.now() - 1000).toISOString() })
    );
    expect(errs.find((e) => e.field === "closesAt")).toBeDefined();
  });

  it("rejects max < min participants", () => {
    const errs = validateCreateGroupBuy(
      validInput({ minParticipants: 5, maxParticipants: 3 })
    );
    expect(errs.find((e) => e.field === "maxParticipants")).toBeDefined();
  });

  it("rejects zero or negative prices", () => {
    expect(
      validateCreateGroupBuy(validInput({ individualPriceRm: 0 })).find(
        (e) => e.field === "individualPriceRm"
      )
    ).toBeDefined();
    expect(
      validateCreateGroupBuy(validInput({ bulkPriceRm: -1 })).find(
        (e) => e.field === "bulkPriceRm"
      )
    ).toBeDefined();
  });
});

describe("savingsPerUnit / savingsPercent", () => {
  it("computes savings correctly", () => {
    expect(savingsPerUnit(100, 80)).toBe(20);
    expect(savingsPercent(100, 80)).toBe(20);
  });
  it("clamps savings at 0 if bulk >= individual", () => {
    expect(savingsPerUnit(50, 60)).toBe(0);
  });
  it("returns 0 percent if individual price is 0", () => {
    expect(savingsPercent(0, 50)).toBe(0);
  });
});

describe("deriveStatus", () => {
  const futureClose = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pastClose = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it("returns open when below minimum and window open", () => {
    expect(
      deriveStatus({
        rawStatus: "open",
        participants: 2,
        minParticipants: 5,
        closesAt: futureClose,
      })
    ).toBe("open");
  });

  it("returns met_minimum when at/above minimum and still open", () => {
    expect(
      deriveStatus({
        rawStatus: "open",
        participants: 5,
        minParticipants: 5,
        closesAt: futureClose,
      })
    ).toBe("met_minimum");
  });

  it("auto-closes when capacity hit", () => {
    expect(
      deriveStatus({
        rawStatus: "open",
        participants: 10,
        minParticipants: 5,
        maxParticipants: 10,
        closesAt: futureClose,
      })
    ).toBe("closed");
  });

  it("auto-cancels if window expired below minimum", () => {
    expect(
      deriveStatus({
        rawStatus: "open",
        participants: 3,
        minParticipants: 5,
        closesAt: pastClose,
      })
    ).toBe("cancelled");
  });

  it("auto-closes if window expired at/above minimum", () => {
    expect(
      deriveStatus({
        rawStatus: "open",
        participants: 6,
        minParticipants: 5,
        closesAt: pastClose,
      })
    ).toBe("closed");
  });

  it("preserves terminal statuses", () => {
    for (const s of ["closed", "fulfilled", "cancelled"] as const) {
      expect(
        deriveStatus({
          rawStatus: s,
          participants: 100,
          minParticipants: 5,
          closesAt: futureClose,
        })
      ).toBe(s);
    }
  });
});

describe("buildStatusForUi", () => {
  it("computes savings correctly in the UI shape", () => {
    const status = buildStatusForUi({
      groupBuyId: "g1",
      district: "Cameron Highlands",
      itemName: "NPK",
      unit: "sack",
      individualPriceRm: 95,
      bulkPriceRm: 78,
      participants: 3,
      minParticipants: 5,
      closesAt: new Date().toISOString(),
      farmerCommitted: false,
    });
    expect(status.savingsRm).toBe(17);
    expect(status.participantsTarget).toBe(5);
    expect(status.farmerCommitted).toBe(false);
  });
});

describe("buildSupplierQuoteMessage", () => {
  it("includes total quantity and bulk price in BM-flavoured message", () => {
    const msg = buildSupplierQuoteMessage({
      supplierName: "Kedai Ah Kow",
      district: "Cameron Highlands",
      itemName: "NPK 15-15-15",
      unit: "sack",
      totalQuantity: 25,
      bulkPriceRm: 78,
      participantCount: 5,
    });
    expect(msg).toMatch(/Salam Kedai Ah Kow/);
    expect(msg).toMatch(/25 sack/);
    expect(msg).toMatch(/RM 78\.00/);
    expect(msg).toMatch(/5 orang petani/);
    expect(msg).toMatch(/Cameron Highlands/);
  });

  it("falls back to generic greeting when no supplier name", () => {
    const msg = buildSupplierQuoteMessage({
      district: "Kedah",
      itemName: "Urea",
      unit: "kg",
      totalQuantity: 100,
      bulkPriceRm: 8,
      participantCount: 4,
    });
    expect(msg).toMatch(/Salam tuan/);
  });
});
