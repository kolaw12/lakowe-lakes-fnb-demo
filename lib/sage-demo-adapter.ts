export const SAGE_DEMO_MAPPING = {
  version: "lakowe-demo-v1",
  disclaimer: "Placeholder categories for simulation only; not Lakowe Lakes' approved Sage 200 configuration.",
  outlets: {
    clubhouse: { revenueCategory: "DEMO_FNB_CLUBHOUSE_SALES" },
    winebar: { revenueCategory: "DEMO_FNB_WINEBAR_SALES" },
    revivo: { revenueCategory: "DEMO_FNB_REVIVO_SALES" },
    "restaurant-18": { revenueCategory: "DEMO_FNB_RESTAURANT_18_SALES" },
  },
  payments: {
    demo: { offsetCategory: "DEMO_TENDER_CLEARING", classification: "simulated tender clearing" },
    wallet_demo: { offsetCategory: "DEMO_WALLET_CLEARING", classification: "wallet settlement clearing" },
    opera_demo: { offsetCategory: "DEMO_GUEST_FOLIO_CLEARING", classification: "guest folio receivable clearing" },
  },
  categories: {
    sale: "DEMO_POS_NET_SALE",
    discounted: "DEMO_POS_SALE_WITH_DISCOUNT",
    voided: "DEMO_POS_VOID_REVERSAL",
    discount: "DEMO_SALES_DISCOUNT",
  },
} as const;

export const SAGE_DEMO_SCENARIOS = [
  { id: "success", label: "Successful posting" },
  { id: "rejected", label: "Mock accounting validation rejection" },
  { id: "unavailable", label: "Service unavailable, safe retry" },
  { id: "uncertain", label: "Uncertain acknowledgment, reconcile only" },
] as const;
export type SageScenario = typeof SAGE_DEMO_SCENARIOS[number]["id"];
export type SagePostingStatus = "posted" | "rejected" | "unavailable" | "uncertain";

export type SageSourceRecord = {
  syncId: string; transactionId: string; orderReference: string; outletId: keyof typeof SAGE_DEMO_MAPPING.outlets;
  paymentMethod: keyof typeof SAGE_DEMO_MAPPING.payments; sourceTransactionStatus: string;
  grossAmount: number; eligibleAmount: number; discountAmount: number; reversalAmount: number; reversalReference: string | null;
};
export type SagePreparedRecord = {
  demo: true; mappingVersion: string; sourceTransactionId: string; sourceOrderReference: string;
  sourceTransactionStatus: string; postingCategory: string; revenueCategory: string; offsetCategory: string;
  grossAmount: number; eligibleAmount: number; discountAmount: number; reversalAmount: number;
  reversalReference: string | null; lines: Array<{ category: string; direction: "debit" | "credit"; amount: number }>;
};
export type SagePostingResult = { status: SagePostingStatus; postingReference: string | null; reason: string | null };

export interface SageAccountingAdapter {
  prepareAccountingRecord(source: SageSourceRecord): Promise<SagePreparedRecord>;
  submitAccountingRecord(record: SagePreparedRecord, scenario: SageScenario, attemptNumber: number, syncId: string): Promise<SagePostingResult>;
  retrievePostingStatus(postingReference: string): Promise<SagePostingResult>;
}

function postingReference(scenario: SageScenario, syncId: string) {
  return `SAGE-DEMO-${scenario.toUpperCase()}-${syncId.replaceAll("-", "").slice(-10).toUpperCase()}`;
}

export class MockSageAccountingAdapter implements SageAccountingAdapter {
  async prepareAccountingRecord(source: SageSourceRecord): Promise<SagePreparedRecord> {
    const outlet = SAGE_DEMO_MAPPING.outlets[source.outletId];
    const payment = SAGE_DEMO_MAPPING.payments[source.paymentMethod];
    if (!outlet || !payment) throw new Error("No DEMO accounting mapping exists for this outlet or payment method.");
    const postingCategory = source.sourceTransactionStatus === "voided" ? SAGE_DEMO_MAPPING.categories.voided : source.discountAmount > 0 ? SAGE_DEMO_MAPPING.categories.discounted : SAGE_DEMO_MAPPING.categories.sale;
    const lines: SagePreparedRecord["lines"] = [];
    if (source.sourceTransactionStatus === "voided") {
      lines.push({ category: SAGE_DEMO_MAPPING.categories.voided, direction: "debit", amount: source.reversalAmount });
      lines.push({ category: payment.offsetCategory, direction: "credit", amount: source.reversalAmount });
    } else {
      lines.push({ category: outlet.revenueCategory, direction: "credit", amount: source.grossAmount });
      if (source.discountAmount > 0) lines.push({ category: SAGE_DEMO_MAPPING.categories.discount, direction: "debit", amount: source.discountAmount });
      lines.push({ category: payment.offsetCategory, direction: "debit", amount: source.eligibleAmount });
    }
    return {
      demo: true, mappingVersion: SAGE_DEMO_MAPPING.version, sourceTransactionId: source.transactionId,
      sourceOrderReference: source.orderReference, sourceTransactionStatus: source.sourceTransactionStatus,
      postingCategory, revenueCategory: outlet.revenueCategory, offsetCategory: payment.offsetCategory,
      grossAmount: source.grossAmount, eligibleAmount: source.eligibleAmount, discountAmount: source.discountAmount,
      reversalAmount: source.reversalAmount, reversalReference: source.reversalReference, lines,
    };
  }

  async submitAccountingRecord(_record: SagePreparedRecord, scenario: SageScenario, attemptNumber: number, syncId: string): Promise<SagePostingResult> {
    if (scenario === "success") return { status: "posted", postingReference: postingReference(scenario, syncId), reason: null };
    if (scenario === "rejected") return { status: "rejected", postingReference: null, reason: "The mock accounting validator rejected this DEMO record." };
    if (scenario === "unavailable" && attemptNumber === 1) return { status: "unavailable", postingReference: null, reason: "The mock Sage service is unavailable. The record was not accepted and may be retried safely." };
    if (scenario === "unavailable") return { status: "posted", postingReference: postingReference("success", syncId), reason: null };
    return { status: "uncertain", postingReference: postingReference(scenario, syncId), reason: "The mock acknowledgment is uncertain. Do not resubmit; retrieve the posting status." };
  }

  async retrievePostingStatus(reference: string): Promise<SagePostingResult> {
    if (reference.startsWith("SAGE-DEMO-UNCERTAIN-")) return { status: "posted", postingReference: reference, reason: null };
    if (reference.startsWith("SAGE-DEMO-SUCCESS-")) return { status: "posted", postingReference: reference, reason: null };
    return { status: "unavailable", postingReference: reference, reason: "No deterministic mock posting result exists for that reference." };
  }
}

export function getSageAdapter(): SageAccountingAdapter {
  return new MockSageAccountingAdapter();
}
