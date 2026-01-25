"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useHierarchy } from "@/app/settings/HierarchyContext";

export default function SettingsPage() {
  const {
    levels,
    nodes,
    addLevel,
    updateLevel,
    removeLevel,
    addNode,
    removeNode,
  } = useHierarchy();
  const [newLevelName, setNewLevelName] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState(
    levels[0]?.id ?? "",
  );
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeCode, setNewNodeCode] = useState("");
  const [newNodeParent, setNewNodeParent] = useState("");

  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => a.order - b.order),
    [levels],
  );
  const selectedLevel = sortedLevels.find((level) => level.id === selectedLevelId);
  const parentLevel = selectedLevel
    ? sortedLevels.find((level) => level.order === selectedLevel.order - 1)
    : undefined;

  const parentOptions = parentLevel
    ? nodes.filter((node) => node.levelId === parentLevel.id)
    : [];

  const levelNodes = nodes.filter((node) => node.levelId === selectedLevelId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Hierarchy Levels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {sortedLevels.map((level) => (
              <div
                key={level.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{level.name}</span>
                  <span className="text-xs text-muted-foreground">
                    key: {level.key}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={level.isRequired}
                      onChange={(event) =>
                        updateLevel(level.id, {
                          isRequired: event.target.checked,
                        })
                      }
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={level.isActive}
                      onChange={(event) =>
                        updateLevel(level.id, {
                          isActive: event.target.checked,
                        })
                      }
                    />
                    Active
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeLevel(level.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
              placeholder="New level name"
              value={newLevelName}
              onChange={(event) => setNewLevelName(event.target.value)}
            />
            <Button
              onClick={() => {
                const name = newLevelName.trim();
                if (!name) {
                  return;
                }
                const nextOrder =
                  sortedLevels[sortedLevels.length - 1]?.order ?? 0;
                addLevel({
                  id: `level-${Date.now()}`,
                  name,
                  key: name.toLowerCase().replace(/\s+/g, "_"),
                  order: nextOrder + 1,
                  isRequired: false,
                  isActive: true,
                });
                setNewLevelName("");
              }}
            >
              Add Level
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hierarchy Nodes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              Level
              <select
                value={selectedLevelId}
                onChange={(event) => setSelectedLevelId(event.target.value)}
                className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
              >
                {sortedLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
            {parentLevel && (
              <label className="flex items-center gap-2">
                Parent {parentLevel.name}
                <select
                  value={newNodeParent}
                  onChange={(event) => setNewNodeParent(event.target.value)}
                  className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
                >
                  <option value="">Select parent</option>
                  {parentOptions.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
              placeholder="Node label"
              value={newNodeLabel}
              onChange={(event) => setNewNodeLabel(event.target.value)}
            />
            <input
              className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
              placeholder="Code (optional)"
              value={newNodeCode}
              onChange={(event) => setNewNodeCode(event.target.value)}
            />
            <Button
              onClick={() => {
                if (!selectedLevelId || !newNodeLabel.trim()) {
                  return;
                }
                addNode({
                  id: `node-${Date.now()}`,
                  levelId: selectedLevelId,
                  label: newNodeLabel.trim(),
                  code: newNodeCode.trim() || undefined,
                  parentId: parentLevel ? newNodeParent || null : null,
                });
                setNewNodeLabel("");
                setNewNodeCode("");
                setNewNodeParent("");
              }}
            >
              Add Node
            </Button>
          </div>

          <div className="space-y-2 text-sm">
            {levelNodes.length === 0 ? (
              <p className="text-muted-foreground">No nodes for this level.</p>
            ) : (
              levelNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{node.label}</div>
                    {node.code && (
                      <div className="text-xs text-muted-foreground">
                        {node.code}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeNode(node.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
