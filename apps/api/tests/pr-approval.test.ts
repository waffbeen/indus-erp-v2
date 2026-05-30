import { describe, it, expect } from "vitest";

/**
 * PR approval state machine.
 *
 * The transition rules live inside pr.service.ts as guard checks scattered
 * across submit/approve/reject/sendBack/cancel (each throws BadRequest on a
 * disallowed source status). This suite encodes those same rules as a PURE
 * specification and exercises every valid + invalid transition, plus the
 * multi-level chain advance. It is the executable spec the service must honour;
 * during consolidation this should be extracted to a shared helper that both
 * the service and these tests import (see PARALLEL_BUILD_NOTES.md).
 *
 * Source of truth for the guards (pr.service.ts):
 *   submit:    draft                                  -> pending_l1
 *   approve:   pending_l1 | pending_l2 | escalated    -> (advance / approved)
 *   reject:    pending_l1 | pending_l2 | escalated    -> rejected
 *   send_back: pending_l1 | pending_l2 | escalated    -> draft
 *   cancel:    anything except a finalized state      -> cancelled
 *   convert:   approved                               -> converted_to_po (by PO approval)
 */

type PrStatus =
  | "draft"
  | "pending_l1"
  | "pending_l2"
  | "escalated"
  | "approved"
  | "rejected"
  | "cancelled"
  | "converted_to_po";

type PrAction = "submit" | "approve" | "reject" | "send_back" | "cancel" | "convert";

const PENDING_STATES: PrStatus[] = ["pending_l1", "pending_l2", "escalated"];
const FINALIZED_STATES: PrStatus[] = ["approved", "rejected", "cancelled", "converted_to_po"];

interface ChainStep {
  level: number;
  roleKey?: string;
  status: "pending" | "waiting" | "approved" | "rejected";
  userId?: string;
}

/** Mirror of pr.service submit: build the N-level chain (clamped 1..3). */
function buildApprovalChain(levels: number): ChainStep[] {
  const n = Math.max(1, Math.min(3, levels));
  return Array.from({ length: n }, (_, i) => ({
    level: i + 1,
    roleKey: "approver",
    status: i === 0 ? "pending" : "waiting",
  }));
}

/**
 * Mirror of pr.service approve (lines ~401-416): advance the chain one step and
 * derive the resulting PR status.
 */
function advanceApprovalChain(chain: ChainStep[], actorUserId: string): { chain: ChainStep[]; status: PrStatus } {
  const currentIdx = chain.findIndex((c) => c.status === "pending");
  const nextChain = chain.map((c, i) => {
    if (i === currentIdx) return { ...c, status: "approved" as const, userId: actorUserId };
    if (i === currentIdx + 1) return { ...c, status: "pending" as const };
    return c;
  });
  const hasNext = currentIdx >= 0 && currentIdx + 1 < chain.length;
  const status: PrStatus = hasNext ? (currentIdx + 1 === 1 ? "pending_l2" : "escalated") : "approved";
  return { chain: nextChain, status };
}

/** Pure guard: is `action` allowed from `status`? Mirrors the service throws. */
function canApply(status: PrStatus, action: PrAction): boolean {
  switch (action) {
    case "submit":
      return status === "draft";
    case "approve":
    case "reject":
    case "send_back":
      return PENDING_STATES.includes(status);
    case "cancel":
      return !FINALIZED_STATES.includes(status);
    case "convert":
      return status === "approved";
    default:
      return false;
  }
}

const ALL_STATUSES: PrStatus[] = [
  "draft",
  "pending_l1",
  "pending_l2",
  "escalated",
  "approved",
  "rejected",
  "cancelled",
  "converted_to_po",
];

describe("PR state machine — happy path", () => {
  it("draft -> pending_l1 on submit", () => {
    expect(canApply("draft", "submit")).toBe(true);
  });

  it("walks draft -> submitted -> pending_l1 -> approved for a single-level chain", () => {
    expect(canApply("draft", "submit")).toBe(true);
    const chain = buildApprovalChain(1);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.status).toBe("pending");
    const { status } = advanceApprovalChain(chain, "approver-1");
    expect(status).toBe("approved");
  });
});

describe("PR state machine — multi-level chain advance", () => {
  it("2-level: pending_l1 -> pending_l2 -> approved", () => {
    let chain = buildApprovalChain(2);
    const step1 = advanceApprovalChain(chain, "approver-1");
    expect(step1.status).toBe("pending_l2");
    expect(step1.chain[0]!.status).toBe("approved");
    expect(step1.chain[1]!.status).toBe("pending");

    const step2 = advanceApprovalChain(step1.chain, "approver-2");
    expect(step2.status).toBe("approved");
    expect(step2.chain.every((c) => c.status === "approved")).toBe(true);
  });

  it("3-level: pending_l1 -> pending_l2 -> escalated -> approved", () => {
    const chain = buildApprovalChain(3);
    const s1 = advanceApprovalChain(chain, "a1");
    expect(s1.status).toBe("pending_l2");
    const s2 = advanceApprovalChain(s1.chain, "a2");
    expect(s2.status).toBe("escalated");
    const s3 = advanceApprovalChain(s2.chain, "a3");
    expect(s3.status).toBe("approved");
  });

  it("clamps requested levels into the 1..3 band", () => {
    expect(buildApprovalChain(0)).toHaveLength(1);
    expect(buildApprovalChain(9)).toHaveLength(3);
  });
});

describe("PR state machine — reject / send_back / cancel", () => {
  it("allows reject + send_back from any pending state", () => {
    for (const s of PENDING_STATES) {
      expect(canApply(s, "reject")).toBe(true);
      expect(canApply(s, "send_back")).toBe(true);
    }
  });

  it("allows cancel from non-finalized states", () => {
    expect(canApply("draft", "cancel")).toBe(true);
    expect(canApply("pending_l1", "cancel")).toBe(true);
    expect(canApply("escalated", "cancel")).toBe(true);
  });

  it("converts an approved PR to converted_to_po (PO approval side-effect)", () => {
    expect(canApply("approved", "convert")).toBe(true);
  });
});

describe("PR state machine — invalid transitions are refused", () => {
  it("cannot submit anything that is not a draft", () => {
    for (const s of ALL_STATUSES) {
      if (s === "draft") continue;
      expect(canApply(s, "submit")).toBe(false);
    }
  });

  it("cannot approve/reject/send_back a draft or a finalized PR", () => {
    for (const action of ["approve", "reject", "send_back"] as const) {
      expect(canApply("draft", action)).toBe(false);
      for (const s of FINALIZED_STATES) {
        expect(canApply(s, action)).toBe(false);
      }
    }
  });

  it("cannot cancel an already-finalized PR", () => {
    for (const s of FINALIZED_STATES) {
      expect(canApply(s, "cancel")).toBe(false);
    }
  });

  it("cannot convert a PR that is not approved", () => {
    for (const s of ALL_STATUSES) {
      if (s === "approved") continue;
      expect(canApply(s, "convert")).toBe(false);
    }
  });
});
