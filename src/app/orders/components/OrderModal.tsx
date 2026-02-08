"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { XIcon } from "lucide-react";
import { useHierarchy } from "@/app/settings/HierarchyContext";

export interface OrderFormValues {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  productName: string;
  quantity: number;
  dueDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  notes?: string;
  hierarchy?: Record<string, string>;
}

interface OrderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: OrderFormValues) => void;
  title?: string;
  submitLabel?: string;
  initialValues?: Partial<OrderFormValues>;
  editMode?: "full" | "category-product-only";
  existingOrderNumbers?: string[];
}

const defaultValues: OrderFormValues = {
  orderNumber: "",
  customerName: "",
  customerEmail: "",
  productName: "",
  quantity: 1,
  dueDate: "",
  priority: "normal",
  notes: "",
};

export function OrderModal({
  open,
  onClose,
  onSubmit,
  title = "Create New Order",
  submitLabel = "Create Order",
  initialValues,
  editMode = "full",
  existingOrderNumbers = [],
}: OrderModalProps) {
  const [formState, setFormState] = useState({
    orderNumber: defaultValues.orderNumber,
    customerName: defaultValues.customerName,
    customerEmail: defaultValues.customerEmail ?? "",
    productName: defaultValues.productName,
    quantity: String(defaultValues.quantity),
    dueDate: defaultValues.dueDate,
    priority: defaultValues.priority,
    notes: defaultValues.notes ?? "",
    hierarchy: {} as Record<string, string>,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [hierarchyInput, setHierarchyInput] = useState<Record<string, string>>(
    {},
  );
  const { levels, nodes } = useHierarchy();
  const activeLevels = useMemo(
    () =>
      levels
        .filter(
          (level) =>
            level.isActive &&
            level.key !== "engineer" &&
            level.key !== "manager",
        )
        .sort((a, b) => a.order - b.order),
    [levels],
  );
  const isCategoryProductOnly = editMode === "category-product-only";
  const editableLevelIds = useMemo(() => {
    if (!isCategoryProductOnly) {
      return new Set(activeLevels.map((level) => level.id));
    }
    const allowedKeys = new Set(["category", "product"]);
    return new Set(
      activeLevels
        .filter((level) => allowedKeys.has(level.key))
        .map((level) => level.id),
    );
  }, [activeLevels, isCategoryProductOnly]);
  const productLevel = useMemo(
    () => activeLevels.find((level) => level.key === "product"),
    [activeLevels],
  );
  const levelNodeMap = useMemo(() => {
    const map = new Map<string, typeof nodes>();
    activeLevels.forEach((level) => {
      map.set(
        level.id,
        nodes.filter((node) => node.levelId === level.id),
      );
    });
    return map;
  }, [activeLevels, nodes]);
  const isEditingOrderNumber = Boolean(initialValues?.orderNumber);
  const normalizedExistingNumbers = useMemo(
    () =>
      existingOrderNumbers
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    [existingOrderNumbers],
  );
  const normalizedCurrentNumber = formState.orderNumber.trim().toLowerCase();
  const isDuplicateOrderNumber =
    normalizedCurrentNumber.length > 0 &&
    !isEditingOrderNumber &&
    normalizedExistingNumbers.includes(normalizedCurrentNumber);

  function resolveNodeId(
    levelId: string,
    label: string,
    parentId?: string | null,
  ) {
    const trimmed = label.trim();
    if (!trimmed) {
      return "";
    }
    const existing = nodes.find(
      (node) =>
        node.levelId === levelId &&
        node.label.toLowerCase() === trimmed.toLowerCase() &&
        (parentId ? node.parentId === parentId : !node.parentId),
    );
    return existing?.id ?? "";
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextValues = {
      ...defaultValues,
      ...initialValues,
    };
    let nextProductName = nextValues.productName;
    if (productLevel && nextValues.hierarchy?.[productLevel.id]) {
      const rawValue = nextValues.hierarchy?.[productLevel.id] ?? "";
      const selectedNode = nodes.find((node) => node.id === rawValue);
      nextProductName = selectedNode?.label ?? (rawValue || nextProductName);
    }
    const nextHierarchy: Record<string, string> = {};
    const nextHierarchyInput: Record<string, string> = {};
    activeLevels.forEach((level) => {
      const nodeId = nextValues.hierarchy?.[level.id];
      if (!nodeId) {
        return;
      }
      const node = nodes.find((item) => item.id === nodeId);
      if (node) {
        nextHierarchy[level.id] = nodeId;
        nextHierarchyInput[level.id] = node.label;
        return;
      }
      // Keep raw value in input for visibility, but drop invalid IDs from state.
      nextHierarchyInput[level.id] = nodeId;
    });
    setFormState({
      orderNumber: nextValues.orderNumber ?? "",
      customerName: nextValues.customerName,
      customerEmail: nextValues.customerEmail ?? "",
      productName: nextProductName,
      quantity: String(nextValues.quantity ?? 1),
      dueDate: nextValues.dueDate,
      priority: nextValues.priority,
      notes: nextValues.notes ?? "",
      hierarchy: nextHierarchy,
    });
    setErrors({});
    setTouched({});
    setHierarchyInput(nextHierarchyInput);
  }, [activeLevels, initialValues, nodes, open, productLevel]);

  function resetForm() {
    setFormState({
      orderNumber: defaultValues.orderNumber,
      customerName: defaultValues.customerName,
      customerEmail: defaultValues.customerEmail ?? "",
      productName: defaultValues.productName,
      quantity: String(defaultValues.quantity),
      dueDate: defaultValues.dueDate,
      priority: defaultValues.priority,
      notes: defaultValues.notes ?? "",
      hierarchy: {},
    });
    setErrors({});
    setTouched({});
    setHierarchyInput({});
  }

  function validateField(field: string, value: string) {
    switch (field) {
      case "customerName":
        return value.trim() ? "" : "Customer name is required.";
      case "orderNumber":
        if (!value.trim()) {
          return "Order number is required.";
        }
        if (isDuplicateOrderNumber) {
          return "Order number already exists.";
        }
        return "";
      case "customerEmail":
        return value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? "Customer email must be valid."
          : "";
      case "productName":
        return "";
      case "quantity": {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0
          ? ""
          : "Quantity must be a positive number.";
      }
      case "dueDate": {
        if (!value) {
          return "Due date is required.";
        }
        if (isEditingOrderNumber) {
          return "";
        }
        const today = new Date();
        const dueDate = new Date(value);
        today.setHours(0, 0, 0, 0);
        return dueDate < today ? "Due date cannot be in the past." : "";
      }
      default:
        return "";
    }
  }

  function handleHierarchyChange(levelId: string, value: string) {
    setFormState((prev) => {
      const nextHierarchy = { ...prev.hierarchy, [levelId]: value };
      // Do not clear lower levels on manual input; many levels are independent.
      const productLevel = activeLevels.find(
        (level) => level.key === "product",
      );
      if (productLevel && levelId === productLevel.id) {
        const selectedNode = nodes.find((node) => node.id === value);
        return {
          ...prev,
          hierarchy: nextHierarchy,
          productName: selectedNode?.label ?? value,
        };
      }
      return { ...prev, hierarchy: nextHierarchy };
    });
  }

  if (!open) {
    return null;
  }

  const requiredFieldsValid = (() => {
    if (isCategoryProductOnly) {
      return true;
    }
    const baseValid =
      formState.orderNumber.trim() &&
      formState.customerName.trim() &&
      formState.quantity.trim() &&
      formState.dueDate.trim() &&
      !isDuplicateOrderNumber &&
      !validateField("quantity", formState.quantity) &&
      !validateField("dueDate", formState.dueDate);
    if (!baseValid) {
      return false;
    }
    const requiredHierarchyOk = activeLevels.every((level) => {
      if (!level.isRequired || !editableLevelIds.has(level.id)) {
        return true;
      }
      return Boolean(
        formState.hierarchy[level.id] || hierarchyInput[level.id]?.trim(),
      );
    });
    return requiredHierarchyOk;
  })();
  const hasErrors = Object.values(errors).some(Boolean);
  const isSubmitDisabled =
    (!requiredFieldsValid && !isCategoryProductOnly) ||
    hasErrors ||
    isDuplicateOrderNumber;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-6 pt-0 shadow-xl">
        <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center justify-between bg-card px-6 py-4 shadow-sm">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close modal"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const resolvedHierarchy = { ...formState.hierarchy };
            activeLevels.forEach((level, index) => {
              const inputValue = hierarchyInput[level.id]?.trim();
              if (!inputValue) {
                return;
              }
              const existingId = resolvedHierarchy[level.id];
              const existingNode = existingId
                ? nodes.find((node) => node.id === existingId)
                : undefined;
              const matchesExisting =
                existingNode &&
                existingNode.label.toLowerCase() === inputValue.toLowerCase();
              if (matchesExisting) {
                return;
              }
              const parentLevel = activeLevels[index - 1];
              const parentId = parentLevel
                ? (resolvedHierarchy[parentLevel.id] ?? null)
                : null;
              const matchedId = resolveNodeId(
                level.id,
                inputValue,
                parentId ?? null,
              );
              resolvedHierarchy[level.id] = matchedId || inputValue;
            });
            const nextErrors: Record<string, string> = {};
            (
              [
                "orderNumber",
                "customerName",
                "customerEmail",
                "quantity",
                "dueDate",
              ] as const
            ).forEach((field) => {
              if (isCategoryProductOnly) {
                return;
              }
              const message = validateField(field, formState[field]);
              if (message) {
                nextErrors[field] = message;
              }
            });
            activeLevels.forEach((level) => {
              if (
                level.isRequired &&
                !resolvedHierarchy[level.id] &&
                editableLevelIds.has(level.id)
              ) {
                nextErrors[`hierarchy.${level.id}`] =
                  `${level.name} is required.`;
              }
            });
            setErrors(nextErrors);
            setTouched({
              ...(isCategoryProductOnly
                ? {}
                : {
                    orderNumber: true,
                    customerName: true,
                    customerEmail: true,
                    quantity: true,
                    dueDate: true,
                  }),
              ...activeLevels.reduce<Record<string, boolean>>((acc, level) => {
                if (editableLevelIds.has(level.id)) {
                  acc[`hierarchy.${level.id}`] = true;
                }
                return acc;
              }, {}),
            });
            if (Object.keys(nextErrors).length > 0) {
              return;
            }

            const parsedQuantity = Number(formState.quantity);
            onSubmit({
              orderNumber: formState.orderNumber.trim(),
              customerName: formState.customerName.trim(),
              customerEmail: formState.customerEmail.trim() || undefined,
              productName: formState.productName.trim(),
              quantity: parsedQuantity,
              dueDate: formState.dueDate,
              priority: formState.priority as
                | "low"
                | "normal"
                | "high"
                | "urgent",
              notes: formState.notes.trim() || undefined,
              hierarchy: resolvedHierarchy,
            });
            resetForm();
            onClose();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Order # *
              <input
                value={formState.orderNumber}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    orderNumber: event.target.value,
                  }))
                }
                onBlur={(event) => {
                  if (isCategoryProductOnly || isEditingOrderNumber) {
                    return;
                  }
                  const message = validateField(
                    "orderNumber",
                    event.target.value,
                  );
                  setErrors((prev) => ({
                    ...prev,
                    orderNumber: message,
                  }));
                  setTouched((prev) => ({ ...prev, orderNumber: true }));
                }}
                className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                  touched.orderNumber && errors.orderNumber
                    ? "border-destructive"
                    : "border-border"
                } bg-input-background`}
                placeholder="Accounting Order #"
                required
                disabled={isCategoryProductOnly || isEditingOrderNumber}
              />
              {touched.orderNumber && errors.orderNumber && (
                <span className="text-xs text-destructive">
                  {errors.orderNumber}
                </span>
              )}
              {!touched.orderNumber && isDuplicateOrderNumber && (
                <span className="text-xs text-destructive">
                  Order number already exists.
                </span>
              )}
            </label>
            <label className="space-y-2 text-sm font-medium">
              Customer Name *
              <input
                value={formState.customerName}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    customerName: event.target.value,
                  }))
                }
                onBlur={(event) => {
                  if (isCategoryProductOnly) {
                    return;
                  }
                  const message = validateField(
                    "customerName",
                    event.target.value,
                  );
                  setErrors((prev) => ({
                    ...prev,
                    customerName: message,
                  }));
                  setTouched((prev) => ({ ...prev, customerName: true }));
                }}
                className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                  touched.customerName && errors.customerName
                    ? "border-destructive"
                    : "border-border"
                } bg-input-background`}
                placeholder="Acme Manufacturing"
                required
                disabled={isCategoryProductOnly}
              />
              {touched.customerName && errors.customerName && (
                <span className="text-xs text-destructive">
                  {errors.customerName}
                </span>
              )}
            </label>
            <label className="space-y-2 text-sm font-medium">
              Customer Email
              <input
                value={formState.customerEmail}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    customerEmail: event.target.value,
                  }))
                }
                onBlur={(event) => {
                  if (isCategoryProductOnly) {
                    return;
                  }
                  const message = validateField(
                    "customerEmail",
                    event.target.value,
                  );
                  setErrors((prev) => ({
                    ...prev,
                    customerEmail: message,
                  }));
                  setTouched((prev) => ({ ...prev, customerEmail: true }));
                }}
                className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                  touched.customerEmail && errors.customerEmail
                    ? "border-destructive"
                    : "border-border"
                } bg-input-background`}
                placeholder="contact@acme.com"
                type="email"
                disabled={isCategoryProductOnly}
              />
              {touched.customerEmail && errors.customerEmail && (
                <span className="text-xs text-destructive">
                  {errors.customerEmail}
                </span>
              )}
            </label>
          </div>

          {activeLevels.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {activeLevels.map((level, index) => {
                const parentLevel = activeLevels[index - 1];
                const parentIdRaw = parentLevel
                  ? formState.hierarchy[parentLevel.id]
                  : null;
                const parentId =
                  parentIdRaw && nodes.some((node) => node.id === parentIdRaw)
                    ? parentIdRaw
                    : null;
                const options = (levelNodeMap.get(level.id) || []).filter(
                  (node) => (parentId ? node.parentId === parentId : true),
                );
                const errorKey = `hierarchy.${level.id}`;
                return (
                  <label
                    key={level.id}
                    className="space-y-2 text-sm font-medium"
                  >
                    {level.name}
                    {level.isRequired ? " *" : ""}
                    <input
                      list={`level-options-${level.id}`}
                      value={hierarchyInput[level.id] ?? ""}
                      onChange={(event) => {
                        if (!editableLevelIds.has(level.id)) {
                          return;
                        }
                        const value = event.target.value;
                        setHierarchyInput((prev) => ({
                          ...prev,
                          [level.id]: value,
                        }));
                        const matched = options.find(
                          (node) =>
                            node.label.toLowerCase() === value.toLowerCase(),
                        );
                        if (matched) {
                          handleHierarchyChange(level.id, matched.id);
                        }
                      }}
                      onBlur={(event) => {
                        if (!editableLevelIds.has(level.id)) {
                          return;
                        }
                        setTouched((prev) => ({
                          ...prev,
                          [errorKey]: true,
                        }));
                        const rawValue = event.target.value.trim();
                        if (!rawValue) {
                          handleHierarchyChange(level.id, "");
                          setHierarchyInput((prev) => ({
                            ...prev,
                            [level.id]: "",
                          }));
                          if (level.isRequired) {
                            setErrors((prev) => ({
                              ...prev,
                              [errorKey]: `${level.name} is required.`,
                            }));
                          }
                          return;
                        }
                        const matched = options.find(
                          (node) =>
                            node.label.toLowerCase() === rawValue.toLowerCase(),
                        );
                        const nextValue = matched ? matched.id : rawValue;
                        handleHierarchyChange(level.id, nextValue);
                        setHierarchyInput((prev) => ({
                          ...prev,
                          [level.id]: matched?.label ?? rawValue,
                        }));
                        setErrors((prev) => ({
                          ...prev,
                          [errorKey]: "",
                        }));
                      }}
                      className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                        touched[errorKey] && errors[errorKey]
                          ? "border-destructive"
                          : "border-border"
                      } bg-input-background`}
                      placeholder={`Search or enter ${level.name}`}
                      disabled={!editableLevelIds.has(level.id)}
                    />
                    <datalist id={`level-options-${level.id}`}>
                      {options.map((node) => (
                        <option key={node.id} value={node.label} />
                      ))}
                    </datalist>
                    {touched[errorKey] && errors[errorKey] && (
                      <span className="text-xs text-destructive">
                        {errors[errorKey]}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Quantity *
              <input
                value={formState.quantity}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    quantity: event.target.value,
                  }))
                }
                onBlur={(event) => {
                  if (isCategoryProductOnly) {
                    return;
                  }
                  const message = validateField("quantity", event.target.value);
                  setErrors((prev) => ({
                    ...prev,
                    quantity: message,
                  }));
                  setTouched((prev) => ({ ...prev, quantity: true }));
                }}
                className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                  touched.quantity && errors.quantity
                    ? "border-destructive"
                    : "border-border"
                } bg-input-background`}
                type="number"
                min={1}
                required
                disabled={isCategoryProductOnly}
              />
              {touched.quantity && errors.quantity && (
                <span className="text-xs text-destructive">
                  {errors.quantity}
                </span>
              )}
            </label>
            <label className="space-y-2 text-sm font-medium">
              Due Date *
              <input
                value={formState.dueDate}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    dueDate: event.target.value,
                  }))
                }
                onBlur={(event) => {
                  if (isCategoryProductOnly) {
                    return;
                  }
                  const message = validateField("dueDate", event.target.value);
                  setErrors((prev) => ({
                    ...prev,
                    dueDate: message,
                  }));
                  setTouched((prev) => ({ ...prev, dueDate: true }));
                }}
                className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                  touched.dueDate && errors.dueDate
                    ? "border-destructive"
                    : "border-border"
                } bg-input-background`}
                type="date"
                required
                disabled={isCategoryProductOnly}
              />
              {touched.dueDate && errors.dueDate && (
                <span className="text-xs text-destructive">
                  {errors.dueDate}
                </span>
              )}
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium">
            Priority
            <select
              value={formState.priority}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  priority: event.target.value as
                    | "low"
                    | "normal"
                    | "high"
                    | "urgent",
                }))
              }
              className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
              disabled={isCategoryProductOnly}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium">
            Notes
            <textarea
              value={formState.notes}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, notes: event.target.value }))
              }
              className="min-h-22.5 w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground"
              placeholder="Special requirements or additional information..."
              disabled={isCategoryProductOnly}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
