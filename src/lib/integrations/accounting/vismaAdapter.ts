import type { AccountingAdapter } from "./types";

export const vismaAdapter: AccountingAdapter = {
  provider: "visma",
  fetchOrders: async () => {
    // TODO: Replace with Visma API integration.
    return [];
  },
};
