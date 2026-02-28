export type OrderCoreFieldDefinition = {
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isRequired: boolean;
  showInTable: boolean;
};

export const ORDER_CORE_FIELDS: OrderCoreFieldDefinition[] = [
  {
    key: "order_number",
    label: "Order #",
    sortOrder: 10,
    isActive: true,
    isRequired: true,
    showInTable: true,
  },
  {
    key: "customer_name",
    label: "Customer",
    sortOrder: 20,
    isActive: true,
    isRequired: true,
    showInTable: true,
  },
  {
    key: "quantity",
    label: "Quantity",
    sortOrder: 30,
    isActive: true,
    isRequired: false,
    showInTable: true,
  },
  {
    key: "due_date",
    label: "Due date",
    sortOrder: 40,
    isActive: true,
    isRequired: true,
    showInTable: true,
  },
  {
    key: "engineer",
    label: "Engineer",
    sortOrder: 50,
    isActive: true,
    isRequired: false,
    showInTable: true,
  },
  {
    key: "manager",
    label: "Manager",
    sortOrder: 60,
    isActive: true,
    isRequired: false,
    showInTable: true,
  },
  {
    key: "priority",
    label: "Priority",
    sortOrder: 70,
    isActive: true,
    isRequired: false,
    showInTable: true,
  },
  {
    key: "status",
    label: "Status",
    sortOrder: 80,
    isActive: true,
    isRequired: false,
    showInTable: true,
  },
  {
    key: "actions",
    label: "Activity",
    sortOrder: 90,
    isActive: true,
    isRequired: false,
    showInTable: true,
  },
  {
    key: "delivery_address",
    label: "Delivery address",
    sortOrder: 100,
    isActive: true,
    isRequired: false,
    showInTable: false,
  },
  {
    key: "customer_phone",
    label: "Customer phone",
    sortOrder: 110,
    isActive: true,
    isRequired: false,
    showInTable: false,
  },
];

export const ORDER_CORE_FIELD_KEYS = new Set(
  ORDER_CORE_FIELDS.map((field) => field.key),
);
