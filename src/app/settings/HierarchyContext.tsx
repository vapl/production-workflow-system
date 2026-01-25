"use client";

import { createContext, useContext, useMemo, useState } from "react";

export interface HierarchyLevel {
  id: string;
  name: string;
  key: string;
  order: number;
  isRequired: boolean;
  isActive: boolean;
}

export interface HierarchyNode {
  id: string;
  levelId: string;
  label: string;
  code?: string;
  parentId?: string | null;
}

interface HierarchyContextValue {
  levels: HierarchyLevel[];
  nodes: HierarchyNode[];
  addLevel: (level: HierarchyLevel) => void;
  updateLevel: (levelId: string, patch: Partial<HierarchyLevel>) => void;
  removeLevel: (levelId: string) => void;
  addNode: (node: HierarchyNode) => void;
  updateNode: (nodeId: string, patch: Partial<HierarchyNode>) => void;
  removeNode: (nodeId: string) => void;
}

const HierarchyContext = createContext<HierarchyContextValue | null>(null);

const defaultLevels: HierarchyLevel[] = [
  {
    id: "level-contract",
    name: "Contract",
    key: "contract",
    order: 1,
    isRequired: false,
    isActive: true,
  },
  {
    id: "level-category",
    name: "Category",
    key: "category",
    order: 2,
    isRequired: false,
    isActive: true,
  },
  {
    id: "level-product",
    name: "Product",
    key: "product",
    order: 3,
    isRequired: true,
    isActive: true,
  },
];

const defaultNodes: HierarchyNode[] = [
  {
    id: "node-contract-vv",
    levelId: "level-contract",
    label: "VV-1234-26",
    code: "VV-1234-26",
    parentId: null,
  },
  {
    id: "node-category-kitchen",
    levelId: "level-category",
    label: "Kitchen furniture",
    parentId: "node-contract-vv",
  },
  {
    id: "node-category-wardrobe",
    levelId: "level-category",
    label: "Skapis",
    parentId: "node-contract-vv",
  },
  {
    id: "node-product-sliding",
    levelId: "level-product",
    label: "Sliding doors",
    parentId: "node-category-kitchen",
  },
  {
    id: "node-product-cabinet",
    levelId: "level-product",
    label: "Kitchen furniture",
    parentId: "node-category-wardrobe",
  },
];

export function HierarchyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [levels, setLevels] = useState<HierarchyLevel[]>(defaultLevels);
  const [nodes, setNodes] = useState<HierarchyNode[]>(defaultNodes);

  const value = useMemo<HierarchyContextValue>(
    () => ({
      levels,
      nodes,
      addLevel: (level) => setLevels((prev) => [...prev, level]),
      updateLevel: (levelId, patch) =>
        setLevels((prev) =>
          prev.map((level) =>
            level.id === levelId ? { ...level, ...patch } : level,
          ),
        ),
      removeLevel: (levelId) =>
        setLevels((prev) => prev.filter((level) => level.id !== levelId)),
      addNode: (node) => setNodes((prev) => [...prev, node]),
      updateNode: (nodeId, patch) =>
        setNodes((prev) =>
          prev.map((node) =>
            node.id === nodeId ? { ...node, ...patch } : node,
          ),
        ),
      removeNode: (nodeId) =>
        setNodes((prev) => prev.filter((node) => node.id !== nodeId)),
    }),
    [levels, nodes],
  );

  return (
    <HierarchyContext.Provider value={value}>
      {children}
    </HierarchyContext.Provider>
  );
}

export function useHierarchy() {
  const context = useContext(HierarchyContext);
  if (!context) {
    throw new Error("useHierarchy must be used within HierarchyProvider");
  }
  return context;
}


