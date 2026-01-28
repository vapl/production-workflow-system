"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";
import { useNotifications } from "@/components/ui/Notifications";

export interface HierarchyLevel {
  id: string;
  name: string;
  key: string;
  order: number;
  isRequired: boolean;
  isActive: boolean;
  showInTable: boolean;
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
  addLevel: (level: Omit<HierarchyLevel, "id">) => Promise<void>;
  updateLevel: (levelId: string, patch: Partial<HierarchyLevel>) => Promise<void>;
  removeLevel: (levelId: string) => Promise<void>;
  addNode: (node: Omit<HierarchyNode, "id"> & { id?: string }) => Promise<void>;
  updateNode: (nodeId: string, patch: Partial<HierarchyNode>) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
}

const HierarchyContext = createContext<HierarchyContextValue | null>(null);

const fallbackLevels: HierarchyLevel[] = [
  {
    id: "level-contract",
    name: "Contract",
    key: "contract",
    order: 1,
    isRequired: false,
    isActive: true,
    showInTable: true,
  },
  {
    id: "level-category",
    name: "Category",
    key: "category",
    order: 2,
    isRequired: false,
    isActive: true,
    showInTable: true,
  },
  {
    id: "level-product",
    name: "Product",
    key: "product",
    order: 3,
    isRequired: true,
    isActive: true,
    showInTable: true,
  },
];

const fallbackNodes: HierarchyNode[] = [
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

function mapLevel(row: {
  id: string;
  name: string;
  key: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  show_in_table: boolean;
}): HierarchyLevel {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    order: row.sort_order,
    isRequired: row.is_required,
    isActive: row.is_active,
    showInTable: row.show_in_table,
  };
}

function mapNode(row: {
  id: string;
  level_id: string;
  label: string;
  code?: string | null;
  parent_id?: string | null;
}): HierarchyNode {
  return {
    id: row.id,
    levelId: row.level_id,
    label: row.label,
    code: row.code ?? undefined,
    parentId: row.parent_id ?? null,
  };
}

export function HierarchyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const { notify } = useNotifications();
  const [levels, setLevels] = useState<HierarchyLevel[]>(fallbackLevels);
  const [nodes, setNodes] = useState<HierarchyNode[]>(fallbackNodes);

  const refreshHierarchy = async () => {
    if (!supabase) {
      setLevels(fallbackLevels);
      setNodes(fallbackNodes);
      return;
    }
    const { data: levelData, error: levelError } = await supabase
      .from("hierarchy_levels")
      .select("id, name, key, sort_order, is_required, is_active, show_in_table")
      .order("sort_order", { ascending: true });
    if (levelError) {
      return;
    }
    const { data: nodeData, error: nodeError } = await supabase
      .from("hierarchy_nodes")
      .select("id, level_id, label, code, parent_id")
      .order("created_at", { ascending: true });
    if (nodeError) {
      return;
    }
    setLevels((levelData ?? []).map(mapLevel));
    setNodes((nodeData ?? []).map(mapNode));
  };

  useEffect(() => {
    if (!supabase) {
      setLevels(fallbackLevels);
      setNodes(fallbackNodes);
      return;
    }
    if (user.loading) {
      return;
    }
    if (!user.isAuthenticated) {
      setLevels([]);
      setNodes([]);
      return;
    }
    void refreshHierarchy();
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const value = useMemo<HierarchyContextValue>(
    () => ({
      levels,
      nodes,
      addLevel: async (level) => {
        if (!supabase) {
          setLevels((prev) => [...prev, { ...level, id: crypto.randomUUID() }]);
          return;
        }
        if (!user.tenantId) {
          return;
        }
        const { data, error } = await supabase
          .from("hierarchy_levels")
          .insert({
            tenant_id: user.tenantId,
            name: level.name,
            key: level.key,
            sort_order: level.order,
            is_required: level.isRequired,
            is_active: level.isActive,
            show_in_table: level.showInTable,
          })
          .select("id, name, key, sort_order, is_required, is_active, show_in_table")
          .single();
        if (error || !data) {
          return;
        }
        setLevels((prev) => [...prev, mapLevel(data)]);
        notify({ title: "Hierarchy level added", variant: "success" });
      },
      updateLevel: async (levelId, patch) => {
        if (!supabase) {
          setLevels((prev) =>
            prev.map((level) =>
              level.id === levelId ? { ...level, ...patch } : level,
            ),
          );
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.name !== undefined) updatePayload.name = patch.name;
        if (patch.key !== undefined) updatePayload.key = patch.key;
        if (patch.order !== undefined) updatePayload.sort_order = patch.order;
        if (patch.isRequired !== undefined)
          updatePayload.is_required = patch.isRequired;
        if (patch.isActive !== undefined)
          updatePayload.is_active = patch.isActive;
        if (patch.showInTable !== undefined)
          updatePayload.show_in_table = patch.showInTable;
        const { data, error } = await supabase
          .from("hierarchy_levels")
          .update(updatePayload)
          .eq("id", levelId)
          .select("id, name, key, sort_order, is_required, is_active, show_in_table")
          .single();
        if (error || !data) {
          return;
        }
        setLevels((prev) =>
          prev.map((level) => (level.id === levelId ? mapLevel(data) : level)),
        );
        notify({ title: "Hierarchy level updated", variant: "success" });
      },
      removeLevel: async (levelId) => {
        if (!supabase) {
          setLevels((prev) => prev.filter((level) => level.id !== levelId));
          setNodes((prev) => prev.filter((node) => node.levelId !== levelId));
          return;
        }
        const { error } = await supabase
          .from("hierarchy_levels")
          .delete()
          .eq("id", levelId);
        if (error) {
          return;
        }
        setLevels((prev) => prev.filter((level) => level.id !== levelId));
        setNodes((prev) => prev.filter((node) => node.levelId !== levelId));
        notify({ title: "Hierarchy level removed", variant: "success" });
      },
      addNode: async (node) => {
        if (!supabase) {
          const nodeId = node.id ?? crypto.randomUUID();
          setNodes((prev) => [...prev, { ...node, id: nodeId }]);
          return;
        }
        if (!user.tenantId) {
          return;
        }
        const nodeId = node.id ?? crypto.randomUUID();
        const { data, error } = await supabase
          .from("hierarchy_nodes")
          .insert({
            tenant_id: user.tenantId,
            id: nodeId,
            level_id: node.levelId,
            label: node.label,
            code: node.code ?? null,
            parent_id: node.parentId ?? null,
          })
          .select("id, level_id, label, code, parent_id")
          .single();
        if (error || !data) {
          return;
        }
        setNodes((prev) => [...prev, mapNode(data)]);
        notify({ title: "Hierarchy item added", variant: "success" });
      },
      updateNode: async (nodeId, patch) => {
        if (!supabase) {
          setNodes((prev) =>
            prev.map((node) =>
              node.id === nodeId ? { ...node, ...patch } : node,
            ),
          );
          return;
        }
        const updatePayload: Record<string, unknown> = {};
        if (patch.label !== undefined) updatePayload.label = patch.label;
        if (patch.code !== undefined) updatePayload.code = patch.code;
        if (patch.parentId !== undefined)
          updatePayload.parent_id = patch.parentId;
        const { data, error } = await supabase
          .from("hierarchy_nodes")
          .update(updatePayload)
          .eq("id", nodeId)
          .select("id, level_id, label, code, parent_id")
          .single();
        if (error || !data) {
          return;
        }
        setNodes((prev) =>
          prev.map((node) => (node.id === nodeId ? mapNode(data) : node)),
        );
        notify({ title: "Hierarchy item updated", variant: "success" });
      },
      removeNode: async (nodeId) => {
        if (!supabase) {
          setNodes((prev) => prev.filter((node) => node.id !== nodeId));
          return;
        }
        const { error } = await supabase
          .from("hierarchy_nodes")
          .delete()
          .eq("id", nodeId);
        if (error) {
          return;
        }
        setNodes((prev) => prev.filter((node) => node.id !== nodeId));
        notify({ title: "Hierarchy item removed", variant: "success" });
      },
    }),
    [levels, nodes, user.tenantId],
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
