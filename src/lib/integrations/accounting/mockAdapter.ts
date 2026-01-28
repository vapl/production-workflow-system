import type { AccountingAdapter, AccountingOrder } from "./types";

export const mockHorizonAdapter: AccountingAdapter = {
  provider: "mock",
  fetchOrders: async () => {
    const response = await fetch("/api/horizon/orders");
    if (!response.ok) {
      return [];
    }
    const data: {
      orders?: Array<{
        id: string;
        contractNo?: string;
        customer: string;
        category?: string;
        product?: string;
        quantity?: number;
        price?: number;
      }>;
    } = await response.json();

    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    return (data.orders ?? []).map((item, index): AccountingOrder => {
      const dueDate = new Date(baseDate);
      dueDate.setDate(baseDate.getDate() + 7 + index);
      const normalizedId = item.id.replace(/^hz-?/i, "");

      return {
        externalId: item.id,
        orderNumber: `HZ-${normalizedId}`,
        customerName: item.customer,
        contract: item.contractNo || undefined,
        category: item.category || undefined,
        product: item.product || undefined,
        productName: item.product || undefined,
        quantity: item.quantity ?? 1,
        dueDate: dueDate.toISOString().slice(0, 10),
        priority: "normal",
        sourcePayload: item as unknown as Record<string, unknown>,
      };
    });
  },
};
