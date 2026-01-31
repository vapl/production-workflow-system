import type { Order } from "@/types/orders";
import type { Batch } from "@/types/batch";
import type { Operator } from "@/types/operator";
import type { WorkStation } from "@/types/workstation";
import type { ConstructionItem } from "@/types/constructionItem";
import type { Partner, PartnerGroup } from "@/types/partner";

export const mockWorkStations: WorkStation[] = [
  { id: "ws-1", name: "Cutting", description: "Sawing and prep", isActive: true },
  { id: "ws-2", name: "Welding", description: "Frame welding", isActive: true },
  { id: "ws-3", name: "Assembly", description: "Final assembly", isActive: true },
  { id: "ws-4", name: "Finishing", description: "Surface finishing", isActive: true },
];

export const mockOperators: Operator[] = [
  { id: "op-1", name: "Janis", role: "Operator", stationId: "ws-1", isActive: true },
  { id: "op-2", name: "Andris", role: "Operator", stationId: "ws-2", isActive: true },
  { id: "op-3", name: "Liga", role: "Assembler", stationId: "ws-3", isActive: true },
  { id: "op-4", name: "Marta", role: "Finisher", stationId: "ws-4", isActive: true },
];

export const mockPartnerGroups: PartnerGroup[] = [
  { id: "pg-1", name: "Glass", isActive: true },
  { id: "pg-2", name: "Coatings", isActive: true },
  { id: "pg-3", name: "Metal parts", isActive: true },
];

export const mockPartners: Partner[] = [
  { id: "p-1", name: "Baltic Glass", groupId: "pg-1", isActive: true },
  { id: "p-2", name: "Glassens", groupId: "pg-1", isActive: true },
  { id: "p-3", name: "Nordic Coatings", groupId: "pg-2", isActive: true },
  { id: "p-4", name: "Metalworks GmbH", groupId: "pg-3", isActive: true },
];

export const mockConstructionItems: ConstructionItem[] = [
  {
    id: "ci-1",
    name: "PE 40 Durvis",
    isActive: true,
  },
  { id: "ci-2", name: "PE 40 Vitrina", isActive: true },
  { id: "ci-3", name: "PE 50 Logs", isActive: true },
  { id: "ci-4", name: "PE 50 Durvis", isActive: true },
  { id: "ci-5", name: "PE 50 Divviru Durvis", isActive: true },
  { id: "ci-6", name: "PE 50 Vitrina", isActive: true },
  { id: "ci-7", name: "PE 50 Sliding", isActive: true },
  { id: "ci-8", name: "PE 68 Durvis", isActive: true },
  { id: "ci-9", name: "PE 68 Divviru Durvis", isActive: true },
  { id: "ci-10", name: "PE 68 Vitrina", isActive: true },
  { id: "ci-11", name: "PE 68 Logs", isActive: true },
  { id: "ci-12", name: "PE 68 Divviru Logs", isActive: true },
  { id: "ci-13", name: "PE 68 Sliding", isActive: true },
  { id: "ci-14", name: "PE 68 HI Durvis", isActive: true },
  { id: "ci-15", name: "PE 68 HI Vitrina", isActive: true },
  { id: "ci-16", name: "PE 68 HI Logs", isActive: true },
  { id: "ci-17", name: "PE 68 HI Divviru Logs", isActive: true },
  { id: "ci-18", name: "PE 78 N Durvis", isActive: true },
  { id: "ci-19", name: "PE 78 N Divviru Durvis", isActive: true },
  { id: "ci-20", name: "PE 78 N Vitrinas", isActive: true },
  { id: "ci-21", name: "PE 78 N Logs", isActive: true },
  { id: "ci-22", name: "PE 78 N Divviru Logs", isActive: true },
  { id: "ci-23", name: "PE 78 NHI Durvis", isActive: true },
  { id: "ci-24", name: "PE 78 NHI Divviru Durvis", isActive: true },
  { id: "ci-25", name: "PE 78 NHI Vitrinas", isActive: true },
  { id: "ci-26", name: "PE 78 NHI Logs", isActive: true },
  { id: "ci-27", name: "PE 78 NHI Divviru Logs", isActive: true },
  { id: "ci-28", name: "PE 78 NHI Sliding", isActive: true },
  { id: "ci-29", name: "EVO 600 Slide", isActive: true },
  { id: "ci-30", name: "SL 1200 1 vertne", isActive: true },
  { id: "ci-31", name: "SL 1200 2 vertnes", isActive: true },
  { id: "ci-32", name: "SL 1600 HI 1 vertne", isActive: true },
  { id: "ci-33", name: "SL1600 HI 2 vertnes", isActive: true },
  { id: "ci-34", name: "SL 1600 HI 3 vertnes", isActive: true },
  { id: "ci-35", name: "SL 1600 HI 4 vertnes", isActive: true },
  { id: "ci-36", name: "SL 1800 HI 1 vertne", isActive: true },
  { id: "ci-37", name: "SL 1800 HI 2 vertnes", isActive: true },
  { id: "ci-38", name: "SL 1800 HI 3 vertnes", isActive: true },
  { id: "ci-39", name: "PE 78 EI (EI30) Durvis", isActive: true },
  { id: "ci-40", name: "PE 78 EI (EI30) Divviru Durvis", isActive: true },
  { id: "ci-41", name: "PE 78 EI (EI30) Vitrinas", isActive: true },
  { id: "ci-42", name: "PE 78 EI (EI30) Logs", isActive: true },
  { id: "ci-43", name: "PE 78 EI (EI60) Durvis", isActive: true },
  { id: "ci-44", name: "PE 78 EI (EI60) Divviru Durvis", isActive: true },
  { id: "ci-45", name: "PE 78 EI (EI60) Vitrinas", isActive: true },
  { id: "ci-46", name: "PE 78 EI (EI60) Logs", isActive: true },
  { id: "ci-47", name: "PE 120 EI Vitinas", isActive: true },
  { id: "ci-48", name: "PF 152 HI", isActive: true },
  { id: "ci-49", name: "Durvju aizvereji", isActive: true },
  { id: "ci-50", name: "FOLD", isActive: true },
  { id: "ci-51", name: "OF 90 IW", isActive: true },
  { id: "ci-52", name: "Trapeces", isActive: true },
  { id: "ci-53", name: "Nestandarts", isActive: true },
];

export const mockOrders: Order[] = [
  {
    id: "o-1",
    orderNumber: "ORD-0287",
    customerName: "FPgruppen",
    productName: "PE 78 EI (EI60) Durvis",
    quantity: 1,
    dueDate: "2026-01-28",
    priority: "normal",
    status: "draft",
    source: "manual",
    externalJobs: [
      {
        id: "ext-1",
        orderId: "o-1",
        partnerName: "Baltic Glass",
        externalOrderNumber: "BG-5512",
        quantity: 1,
        dueDate: "2026-02-01",
        status: "ordered",
        createdAt: "2026-01-29",
        attachments: [],
      },
    ],
  },
  {
    id: "o-2",
    orderNumber: "ORD-0288",
    customerName: "Hallgruppen",
    productName: "PE 50 Logs",
    quantity: 4,
    dueDate: "2026-02-02",
    priority: "high",
    status: "ready_for_engineering",
    source: "manual",
  },
  {
    id: "o-3",
    orderNumber: "ORD-0289",
    customerName: "ACME Industries",
    productName: "Custom Bracket Assembly",
    quantity: 100,
    dueDate: "2026-02-10",
    priority: "urgent",
    status: "in_engineering",
    source: "manual",
  },
];

export const mockBatches: Batch[] = [
  {
    id: "b-1",
    orderId: "o-1",
    name: "Cutting - Frame Parts",
    workstation: "Cutting",
    operator: "Janis",
    estimatedHours: 6,
    actualHours: 7.5,
    status: "in_progress",
  },
  {
    id: "b-2",
    orderId: "o-1",
    name: "Welding - Main Frame",
    workstation: "Welding",
    operator: "Andris",
    estimatedHours: 8,
    actualHours: 8,
    status: "completed",
  },
  {
    id: "b-3",
    orderId: "o-2",
    name: "Assembly",
    workstation: "Assembly",
    operator: "Liga",
    estimatedHours: 5,
    actualHours: 6,
    status: "blocked",
  },
];
