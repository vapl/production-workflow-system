import type { AccountingAdapter, AccountingProvider } from "./types";
import { mockHorizonAdapter } from "./mockAdapter";
import { vismaAdapter } from "./vismaAdapter";

export function getAccountingAdapter(): AccountingAdapter {
  const provider =
    (process.env.NEXT_PUBLIC_ACCOUNTING_PROVIDER as AccountingProvider) ??
    "mock";

  switch (provider) {
    case "mock":
    case "horizon":
      return mockHorizonAdapter;
    case "visma":
      return vismaAdapter;
    default:
      return mockHorizonAdapter;
  }
}
