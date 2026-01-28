export type AccountingProvider = "mock" | "horizon" | "visma";

export interface AccountingOrder {
  externalId: string;
  orderNumber: string;
  customerName: string;
  contract?: string;
  category?: string;
  product?: string;
  productName?: string;
  quantity?: number;
  dueDate: string; // ISO date string
  priority?: "low" | "normal" | "high" | "urgent";
  sourcePayload?: Record<string, unknown>;
}

export interface AccountingAdapter {
  provider: AccountingProvider;
  fetchOrders: () => Promise<AccountingOrder[]>;
}
