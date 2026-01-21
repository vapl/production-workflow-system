export const dashboardMockData = {
  kpis: {
    activeOrders: 4,
    activeBatches: 2,
    completedToday: 1,
    bottlenecks: 1,
  },
  bottlenecks: [
    {
      id: "b1",
      name: "Machining - Thread Cutting",
      orderNumber: "ORD-1002",
      workStation: "Machining",
      estimatedHours: 10,
      actualHours: 13,
    },
  ],
  recentBatches: [
    {
      id: "b2",
      name: "Welding - Frame Assembly",
      orderNumber: "ORD-1001",
      workStation: "Welding",
      status: "in_progress",
      updatedAt: new Date().toISOString(),
    },
  ],
};
