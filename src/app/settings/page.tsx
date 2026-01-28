"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useHierarchy } from "./HierarchyContext";
import { useSettingsData } from "@/hooks/useSettingsData";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const integrations = [
  { id: "int-1", name: "Horizon", status: "Coming soon" },
  { id: "int-2", name: "Odoo", status: "Coming soon" },
  { id: "int-3", name: "SAP Business One", status: "Coming soon" },
  { id: "int-4", name: "QuickBooks", status: "Coming soon" },
  { id: "int-5", name: "Custom API", status: "Coming soon" },
];

export default function SettingsPage() {
  const {
    levels,
    nodes,
    addLevel,
    updateLevel,
    removeLevel,
    addNode,
    updateNode,
    removeNode,
  } = useHierarchy();

  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => a.order - b.order),
    [levels],
  );

  const [levelName, setLevelName] = useState("");
  const [levelKey, setLevelKey] = useState("");
  const [levelOrder, setLevelOrder] = useState<number>(sortedLevels.length + 1);
  const [levelRequired, setLevelRequired] = useState(false);
  const [levelActive, setLevelActive] = useState(true);
  const [levelShowInTable, setLevelShowInTable] = useState(true);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);

  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    sortedLevels[0]?.id ?? "",
  );
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeCode, setNodeCode] = useState("");
  const [nodeParentId, setNodeParentId] = useState<string>("none");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const {
    workStations,
    operators,
    stopReasons,
    addWorkStation,
    updateWorkStation,
    removeWorkStation,
    addOperator,
    updateOperator,
    removeOperator,
    addStopReason,
    updateStopReason,
    removeStopReason,
  } = useSettingsData();

  const [stationName, setStationName] = useState("");
  const [stationDescription, setStationDescription] = useState("");
  const [editingStationId, setEditingStationId] = useState<string | null>(null);

  const [operatorName, setOperatorName] = useState("");
  const [operatorRole, setOperatorRole] = useState("");
  const [operatorStationId, setOperatorStationId] = useState<string>("");
  const [operatorActive, setOperatorActive] = useState(true);
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(
    null,
  );

  const [stopReasonLabel, setStopReasonLabel] = useState("");
  const [editingStopReasonId, setEditingStopReasonId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!selectedLevelId && sortedLevels[0]?.id) {
      setSelectedLevelId(sortedLevels[0].id);
      return;
    }
    if (
      selectedLevelId &&
      !levels.some((level) => level.id === selectedLevelId)
    ) {
      setSelectedLevelId(sortedLevels[0]?.id ?? "");
    }
  }, [levels, selectedLevelId, sortedLevels]);

  useEffect(() => {
    setLevelOrder(sortedLevels.length + 1);
  }, [sortedLevels.length]);

  const selectedLevel = levels.find((level) => level.id === selectedLevelId);
  const selectedLevelOrder = selectedLevel?.order ?? 0;
  const parentLevel = useMemo(
    () =>
      sortedLevels
        .filter((level) => level.order < selectedLevelOrder && level.isActive)
        .at(-1),
    [selectedLevelOrder, sortedLevels],
  );

  const parentNodes = parentLevel
    ? nodes.filter((node) => node.levelId === parentLevel.id)
    : [];
  const currentLevelNodes = nodes.filter(
    (node) => node.levelId === selectedLevelId,
  );

  function resetLevelForm() {
    setLevelName("");
    setLevelKey("");
    setLevelRequired(false);
    setLevelActive(true);
    setLevelShowInTable(true);
    setEditingLevelId(null);
  }

  function handleSaveLevel() {
    const trimmedName = levelName.trim();
    if (!trimmedName) {
      return;
    }
    const normalizedKey = levelKey.trim() || slugify(trimmedName);
    if (editingLevelId) {
      updateLevel(editingLevelId, {
        name: trimmedName,
        key: normalizedKey,
        order: levelOrder,
        isRequired: levelRequired,
        isActive: levelActive,
        showInTable: levelShowInTable,
      });
      resetLevelForm();
      return;
    }

    void addLevel({
      name: trimmedName,
      key: normalizedKey,
      order: levelOrder,
      isRequired: levelRequired,
      isActive: levelActive,
      showInTable: levelShowInTable,
    });
    resetLevelForm();
  }

  function handleEditLevel(levelId: string) {
    const level = levels.find((item) => item.id === levelId);
    if (!level) {
      return;
    }
    setEditingLevelId(levelId);
    setLevelName(level.name);
    setLevelKey(level.key);
    setLevelOrder(level.order);
    setLevelRequired(level.isRequired);
    setLevelActive(level.isActive);
    setLevelShowInTable(level.showInTable);
  }

  function resetNodeForm() {
    setNodeLabel("");
    setNodeCode("");
    setNodeParentId("none");
    setEditingNodeId(null);
  }

  function handleSaveNode() {
    if (!selectedLevel) {
      return;
    }
    const trimmedLabel = nodeLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const parentIdValue = nodeParentId === "none" ? null : nodeParentId;
    if (editingNodeId) {
      updateNode(editingNodeId, {
        label: trimmedLabel,
        code: nodeCode.trim() || undefined,
        parentId: parentIdValue,
      });
      resetNodeForm();
      return;
    }
    void addNode({
      levelId: selectedLevel.id,
      label: trimmedLabel,
      code: nodeCode.trim() || undefined,
      parentId: parentIdValue,
    });
    resetNodeForm();
  }

  function handleEditNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    setEditingNodeId(nodeId);
    setNodeLabel(node.label);
    setNodeCode(node.code ?? "");
    setNodeParentId(node.parentId ?? "none");
  }

  function resetStationForm() {
    setStationName("");
    setStationDescription("");
    setEditingStationId(null);
  }

  async function handleSaveStation() {
    const trimmedName = stationName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingStationId) {
      await updateWorkStation(editingStationId, {
        name: trimmedName,
        description: stationDescription.trim() || undefined,
      });
      resetStationForm();
      return;
    }
    await addWorkStation({
      name: trimmedName,
      description: stationDescription.trim() || undefined,
      isActive: true,
    });
    resetStationForm();
  }

  function handleEditStation(stationId: string) {
    const station = workStations.find((item) => item.id === stationId);
    if (!station) {
      return;
    }
    setEditingStationId(stationId);
    setStationName(station.name);
    setStationDescription(station.description ?? "");
  }

  function resetOperatorForm() {
    setOperatorName("");
    setOperatorRole("");
    setOperatorStationId("");
    setOperatorActive(true);
    setEditingOperatorId(null);
  }

  async function handleSaveOperator() {
    const trimmedName = operatorName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingOperatorId) {
      await updateOperator(editingOperatorId, {
        name: trimmedName,
        role: operatorRole.trim() || undefined,
        stationId: operatorStationId || undefined,
        isActive: operatorActive,
      });
      resetOperatorForm();
      return;
    }
    await addOperator({
      name: trimmedName,
      role: operatorRole.trim() || undefined,
      stationId: operatorStationId || undefined,
      isActive: operatorActive,
    });
    resetOperatorForm();
  }

  function handleEditOperator(operatorId: string) {
    const operator = operators.find((item) => item.id === operatorId);
    if (!operator) {
      return;
    }
    setEditingOperatorId(operatorId);
    setOperatorName(operator.name);
    setOperatorRole(operator.role ?? "");
    setOperatorStationId(operator.stationId ?? "");
    setOperatorActive(operator.isActive);
  }

  function resetStopReasonForm() {
    setStopReasonLabel("");
    setEditingStopReasonId(null);
  }

  async function handleSaveStopReason() {
    const trimmedLabel = stopReasonLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    if (editingStopReasonId) {
      await updateStopReason(editingStopReasonId, { label: trimmedLabel });
      resetStopReasonForm();
      return;
    }
    await addStopReason(trimmedLabel);
    resetStopReasonForm();
  }

  function handleEditStopReason(reasonId: string) {
    const reason = stopReasons.find((item) => item.id === reasonId);
    if (!reason) {
      return;
    }
    setEditingStopReasonId(reasonId);
    setStopReasonLabel(reason.label);
  }

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Hierarchy Levels</CardTitle>
          <CardDescription>
            Define the order of fields users select when creating orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(200px,1.2fr)_minmax(160px,1fr)_minmax(120px,0.5fr)_minmax(120px,0.6fr)_auto] lg:items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Level name</label>
              <input
                value={levelName}
                onChange={(event) => {
                  setLevelName(event.target.value);
                  if (!editingLevelId) {
                    setLevelKey(slugify(event.target.value));
                  }
                }}
                placeholder="Contract"
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Key</label>
              <input
                value={levelKey}
                onChange={(event) => setLevelKey(event.target.value)}
                placeholder="contract"
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Order</label>
              <input
                type="number"
                min={1}
                value={levelOrder}
                onChange={(event) =>
                  setLevelOrder(Number(event.target.value) || 1)
                }
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={levelRequired}
                onChange={(event) => setLevelRequired(event.target.checked)}
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={levelActive}
                onChange={(event) => setLevelActive(event.target.checked)}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={levelShowInTable}
                onChange={(event) => setLevelShowInTable(event.target.checked)}
              />
              Show in table
            </label>
          </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveLevel}>
                {editingLevelId ? "Save level" : "Add level"}
              </Button>
              {editingLevelId && (
                <Button variant="outline" onClick={resetLevelForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Level</th>
                  <th className="px-4 py-2 text-left font-medium">Key</th>
                  <th className="px-4 py-2 text-left font-medium">Order</th>
                  <th className="px-4 py-2 text-left font-medium">Required</th>
                  <th className="px-4 py-2 text-left font-medium">Active</th>
                  <th className="px-4 py-2 text-left font-medium">In table</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedLevels.map((level) => (
                  <tr key={level.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{level.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {level.key}
                    </td>
                    <td className="px-4 py-2">{level.order}</td>
                    <td className="px-4 py-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={level.isRequired}
                          onChange={(event) =>
                            updateLevel(level.id, {
                              isRequired: event.target.checked,
                            })
                          }
                        />
                        {level.isRequired ? "Yes" : "No"}
                      </label>
                    </td>
                    <td className="px-4 py-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={level.isActive}
                          onChange={(event) =>
                            updateLevel(level.id, {
                              isActive: event.target.checked,
                            })
                          }
                        />
                        {level.isActive ? "Active" : "Hidden"}
                      </label>
                    </td>
                    <td className="px-4 py-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={level.showInTable}
                          onChange={(event) =>
                            updateLevel(level.id, {
                              showInTable: event.target.checked,
                            })
                          }
                        />
                        {level.showInTable ? "Shown" : "Hidden"}
                      </label>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditLevel(level.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLevel(level.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedLevels.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Add your first hierarchy level.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reference Lists</CardTitle>
          <CardDescription>
            Maintain the selectable values for each hierarchy level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Level</label>
              <select
                value={selectedLevelId}
                onChange={(event) => setSelectedLevelId(event.target.value)}
                className="h-10 min-w-50 rounded-lg border border-border bg-input-background px-3 text-sm"
              >
                {sortedLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>
            {parentLevel && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  Parent ({parentLevel.name})
                </label>
                <select
                  value={nodeParentId}
                  onChange={(event) => setNodeParentId(event.target.value)}
                  className="h-10 min-w-50 rounded-lg border border-border bg-input-background px-3 text-sm"
                >
                  <option value="none">No parent</option>
                  {parentNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.6fr)_auto] lg:items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Label</label>
              <input
                value={nodeLabel}
                onChange={(event) => setNodeLabel(event.target.value)}
                placeholder="Enter label"
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Code (optional)</label>
              <input
                value={nodeCode}
                onChange={(event) => setNodeCode(event.target.value)}
                placeholder="Optional code"
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveNode}>
                {editingNodeId ? "Save item" : "Add item"}
              </Button>
              {editingNodeId && (
                <Button variant="outline" onClick={resetNodeForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Label</th>
                  <th className="px-4 py-2 text-left font-medium">Code</th>
                  <th className="px-4 py-2 text-left font-medium">Parent</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentLevelNodes.map((node) => (
                  <tr key={node.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{node.label}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {node.code ?? "--"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {node.parentId
                        ? (nodes.find((item) => item.id === node.parentId)
                            ?.label ?? "--")
                        : "--"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditNode(node.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeNode(node.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {currentLevelNodes.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Add items for this level.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Work Stations</CardTitle>
            <CardDescription>
              Manage the list of production stations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(240px,1.2fr)_auto] lg:items-end">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Station name</label>
                <input
                  value={stationName}
                  onChange={(event) => setStationName(event.target.value)}
                  placeholder="Cutting"
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Description</label>
                <input
                  value={stationDescription}
                  onChange={(event) =>
                    setStationDescription(event.target.value)
                  }
                  placeholder="Sawing and prep"
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveStation}>
                  {editingStationId ? "Save station" : "Add station"}
                </Button>
                {editingStationId && (
                  <Button variant="outline" onClick={resetStationForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {workStations.map((station) => (
                <div
                  key={station.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div>
                    <div className="font-medium">{station.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {station.description ?? "No description"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={station.isActive}
                        onChange={(event) =>
                          updateWorkStation(station.id, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                      Active
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditStation(station.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWorkStation(station.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operators</CardTitle>
            <CardDescription>
              Keep track of operators assigned to each station.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
              <div className="flex min-w-50 flex-1 flex-col gap-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  value={operatorName}
                  onChange={(event) => setOperatorName(event.target.value)}
                  placeholder="Operator name"
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </div>
              <div className="flex min-w-35 flex-1 flex-col gap-2">
                <label className="text-sm font-medium">Role</label>
                <input
                  value={operatorRole}
                  onChange={(event) => setOperatorRole(event.target.value)}
                  placeholder="Operator"
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </div>
              <div className="flex min-w-45 flex-1 flex-col gap-2">
                <label className="text-sm font-medium">Station</label>
                <select
                  value={operatorStationId}
                  onChange={(event) => setOperatorStationId(event.target.value)}
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {workStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={operatorActive}
                    onChange={(event) =>
                      setOperatorActive(event.target.checked)
                    }
                  />
                  Active
                </label>
                <Button onClick={handleSaveOperator}>
                  {editingOperatorId ? "Save operator" : "Add operator"}
                </Button>
                {editingOperatorId && (
                  <Button variant="outline" onClick={resetOperatorForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {operators.map((operator) => (
                <div
                  key={operator.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div>
                    <div className="font-medium">{operator.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {operator.role ?? "Operator"}{" "}
                      {operator.stationId
                        ? `- ${
                            workStations.find(
                              (station) => station.id === operator.stationId,
                            )?.name ?? "Unassigned"
                          }`
                        : "- Unassigned"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={operator.isActive}
                        onChange={(event) =>
                          updateOperator(operator.id, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                      Active
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditOperator(operator.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOperator(operator.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Stop Reasons</CardTitle>
            <CardDescription>
              Reasons appear when a station pauses a task.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Reason</label>
                <input
                  value={stopReasonLabel}
                  onChange={(event) => setStopReasonLabel(event.target.value)}
                  placeholder="Missing material"
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveStopReason}>
                  {editingStopReasonId ? "Save reason" : "Add reason"}
                </Button>
                {editingStopReasonId && (
                  <Button variant="outline" onClick={resetStopReasonForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {stopReasons.map((reason) => (
                <div
                  key={reason.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="font-medium">{reason.label}</div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={reason.isActive}
                        onChange={(event) =>
                          updateStopReason(reason.id, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                      Active
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditStopReason(reason.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStopReason(reason.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              Orders can sync from accounting tools to PWS - coming soon.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="font-medium">{integration.name}</div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {integration.status}
                </span>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Expected flow: accounting order to PWS to production stations.
            </div>
            <Button variant="outline" className="w-full">
              Request integration
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
