import type { FinancialReconciliationQueueRow } from "./financial-reconciliation-server";

export type ReconciliationGuidance = {
  headline: string;
  explanation: string;
  likelyCauses: string[];
  recommendedAction: string;
  differenceLabel: string;
  differenceAmount: number | null;
};

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

function categoryFor(row: FinancialReconciliationQueueRow): string {
  return row.caseState?.category ?? row.category;
}

export function buildReconciliationGuidance(row: FinancialReconciliationQueueRow): ReconciliationGuidance {
  const category = categoryFor(row);

  if (category === "stale_qbo_data") {
    return {
      headline: "QBO data is not current enough to review",
      explanation: "The accounting snapshot is older than the selected review date. Any difference shown may simply be caused by using information from different dates.",
      likelyCauses: [],
      recommendedAction: "Refresh QBO, then review the project again before asking anyone to investigate a difference.",
      differenceLabel: "Comparison is on hold",
      differenceAmount: null,
    };
  }

  if (category === "missing_qbo_actuals") {
    return {
      headline: "No QBO accounting totals are available",
      explanation: "Tracker has project activity, but there is no saved QBO accounting snapshot for the selected date. A financial comparison cannot be made yet.",
      likelyCauses: [
        "Check whether the project is mapped to the correct QBO job or customer.",
        "Check whether the selected accounting date has been refreshed from QBO.",
      ],
      recommendedAction: "Refresh QBO first. If the project is still missing, confirm its QBO job mapping.",
      differenceLabel: "Comparison is unavailable",
      differenceAmount: null,
    };
  }

  if (category === "missing_tracker_contract") {
    return {
      headline: "Tracker is missing the project contract value",
      explanation: "QBO can show billings and accounting profit, but Tracker has no approved contract value to compare them with. Revenue progress against the approved contract cannot be assessed until that value is confirmed. QBO accounting profit remains available separately.",
      likelyCauses: [
        "Check whether the approved quote or contract was carried into Tracker.",
        "Check whether the project was created before the final scope value was known.",
      ],
      recommendedAction: "Confirm the approved contract value and add it to Tracker, then review revenue again.",
      differenceLabel: "Revenue comparison is incomplete",
      differenceAmount: null,
    };
  }

  if (category === "missing_labor_rate") {
    const missingHours = row.laborCoverage.missingRateHours.toFixed(2);
    return {
      headline: "Tracker labor cost is incomplete",
      explanation: `${missingHours} hours have no verified pay rate. Tracker can count those hours, but it cannot value them correctly, so the cost difference is provisional.`,
      likelyCauses: [
        "Check whether an employee or time-entry rate is missing from the verified QBO Time rate source.",
        "Check whether a recent employee or rate change has not been mapped yet.",
      ],
      recommendedAction: "Assign verified pay rates to the missing hours, then recalculate the Tracker cost before investigating the remaining difference.",
      differenceLabel: "Cost comparison is provisional",
      differenceAmount: row.costVariance.amount,
    };
  }

  if (category === "cost_variance") {
    const amount = row.costVariance.amount ?? 0;
    if (row.costVariance.direction === "qbo_higher") {
      return {
        headline: `QBO has ${money(amount)} more cost than Tracker shows`,
        explanation: "QBO is the accounting total used for financial reporting. Tracker is operational evidence built from imported project expenses and verified direct wages, so it does not automatically include every accounting cost.",
        likelyCauses: [
          "Check whether QBO includes payroll taxes, employer burden, benefits, or workers’ compensation.",
          "Check whether purchases, vendor bills, or adjustments were booked directly in QBO but are not represented in Tracker.",
          "Check whether a cost is mapped to this QBO job differently than the Tracker project activity.",
          "Check whether the two systems include transactions from different posting or cutoff dates.",
        ],
        recommendedAction: "Compare the QBO cost detail with Tracker expenses and labor. Classify the gap as expected accounting burden, timing, mapping, or a missing transaction.",
        differenceLabel: "QBO cost is higher by",
        differenceAmount: amount,
      };
    }

    if (row.costVariance.direction === "tracker_higher") {
      return {
        headline: `Tracker shows ${money(amount)} more cost than QBO`,
        explanation: "Tracker contains operational activity that is not yet reflected in the QBO accounting total for the selected date.",
        likelyCauses: [
          "Check whether a Tracker expense or labor cost has not posted to QBO yet.",
          "Check whether a transaction is pending, mapped to another QBO job, or outside the accounting cutoff date.",
          "Check whether Tracker includes an operational item that accounting will classify differently.",
        ],
        recommendedAction: "Check Tracker expenses and labor for pending or unmapped items, then confirm whether they should be posted or reclassified in QBO.",
        differenceLabel: "Tracker cost is higher by",
        differenceAmount: amount,
      };
    }
  }

  if (category === "revenue_variance") {
    const amount = row.revenueVariance.amount ?? 0;
    if (row.revenueVariance.direction === "tracker_higher") {
      return {
        headline: `Tracker contract is ${money(amount)} above QBO billings`,
        explanation: "Tracker shows the approved contract value, while QBO shows what has been billed to date. A difference may be normal while a project is still being invoiced.",
        likelyCauses: [
          "Check whether part of the approved contract has not been billed yet.",
          "Check whether a change order is recorded in Tracker but not yet invoiced in QBO.",
          "Check whether the billing schedule or accounting cutoff falls after the selected date.",
        ],
        recommendedAction: "Confirm the billing schedule and approved change orders. If the amount should already be billed, ask accounting to review the QBO invoices.",
        differenceLabel: "Unbilled contract value",
        differenceAmount: amount,
      };
    }

    if (row.revenueVariance.direction === "qbo_higher") {
      return {
        headline: `QBO billings are ${money(amount)} above the Tracker contract`,
        explanation: "QBO shows more billed revenue than Tracker’s approved contract value. The systems may not contain the same change orders, credits, or project scope.",
        likelyCauses: [
          "Check whether a billed change order was not added to the Tracker contract value.",
          "Check whether a QBO invoice or credit is mapped to the wrong project.",
          "Check whether Tracker has an outdated contract amount.",
        ],
        recommendedAction: "Compare QBO invoices and credits with the approved contract and change orders, then correct the outdated or misclassified record.",
        differenceLabel: "QBO billings are higher by",
        differenceAmount: amount,
      };
    }
  }

  return {
    headline: "No material financial difference needs review",
    explanation: "The current QBO accounting totals and Tracker project evidence are within the review tolerance.",
    likelyCauses: [],
    recommendedAction: "No action is needed unless the project team knows of an unrecorded transaction.",
    differenceLabel: "Within review tolerance",
    differenceAmount: null,
  };
}
