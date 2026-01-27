import { NextResponse } from "next/server";

const horizonOrders = [
  {
    id: "hz-1001",
    contractNo: "VV-1234-26",
    customer: "FPgruppen",
    category: "Wardrobe",
    product: "Classic",
    quantity: 1,
    price: 1200,
  },
  {
    id: "hz-1002",
    contractNo: "VV-1234-26",
    customer: "FPgruppen",
    category: "Kitchen furniture",
    product: "Modern",
    quantity: 1,
    price: 5000,
  },
  {
    id: "hz-1003",
    contractNo: "L7-205693-25",
    customer: "Woodpainters Production",
    category: "Sliding doors",
    product: "Linea",
    quantity: 2,
    price: 2100,
  },
  {
    id: "hz-1004",
    contractNo: "",
    customer: "ACME Industries",
    category: "Custom",
    product: "Custom Bracket Assembly",
    quantity: 100,
    price: 4500,
  },
];

export async function GET() {
  return NextResponse.json({
    source: "horizon-mock",
    updatedAt: new Date().toISOString(),
    orders: horizonOrders,
  });
}
