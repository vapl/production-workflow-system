"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { XIcon } from "lucide-react";
import { mockConstructionItems } from "@/lib/data/mockData";

export interface OrderFormValues {
  customerName: string;
  customerEmail?: string;
  productName: string;
  quantity: number;
  dueDate: string;
  priority: "low" | "normal" | "high" | "urgent";
  notes?: string;
}

interface OrderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: OrderFormValues) => void;
  title?: string;
  submitLabel?: string;
  initialValues?: Partial<OrderFormValues>;
}

const defaultValues: OrderFormValues = {
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
}: OrderModalProps) {
  const [formState, setFormState] = useState({
    customerName: defaultValues.customerName,
    customerEmail: defaultValues.customerEmail ?? "",
    productName: defaultValues.productName,
    quantity: String(defaultValues.quantity),
    dueDate: defaultValues.dueDate,
    priority: defaultValues.priority,
    notes: defaultValues.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextValues = {
      ...defaultValues,
      ...initialValues,
    };
    setFormState({
      customerName: nextValues.customerName,
      customerEmail: nextValues.customerEmail ?? "",
      productName: nextValues.productName,
      quantity: String(nextValues.quantity ?? 1),
      dueDate: nextValues.dueDate,
      priority: nextValues.priority,
      notes: nextValues.notes ?? "",
    });
    setErrors({});
    setTouched({});
  }, [initialValues, open]);

  function resetForm() {
    setFormState({
      customerName: defaultValues.customerName,
      customerEmail: defaultValues.customerEmail ?? "",
      productName: defaultValues.productName,
      quantity: String(defaultValues.quantity),
      dueDate: defaultValues.dueDate,
      priority: defaultValues.priority,
      notes: defaultValues.notes ?? "",
    });
    setErrors({});
    setTouched({});
  }

  function validateField(field: string, value: string) {
    switch (field) {
      case "customerName":
        return value.trim() ? "" : "Customer name is required.";
      case "customerEmail":
        return value.trim() &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? "Customer email must be valid."
          : "";
      case "productName":
        return value.trim() ? "" : "Product name is required.";
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
        const today = new Date();
        const dueDate = new Date(value);
        today.setHours(0, 0, 0, 0);
        return dueDate < today ? "Due date cannot be in the past." : "";
      }
      default:
        return "";
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
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
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const nextErrors: Record<string, string> = {};
            ([
              "customerName",
              "customerEmail",
              "productName",
              "quantity",
              "dueDate",
            ] as const).forEach((field) => {
              const message = validateField(field, formState[field]);
              if (message) {
                nextErrors[field] = message;
              }
            });
            setErrors(nextErrors);
            setTouched({
              customerName: true,
              customerEmail: true,
              productName: true,
              quantity: true,
              dueDate: true,
            });
            if (Object.keys(nextErrors).length > 0) {
              return;
            }

            const parsedQuantity = Number(formState.quantity);
            onSubmit({
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
            });
            resetForm();
            onClose();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
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
              />
              {touched.customerEmail && errors.customerEmail && (
                <span className="text-xs text-destructive">
                  {errors.customerEmail}
                </span>
              )}
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium">
            Product Name *
            <select
              value={formState.productName}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  productName: event.target.value,
                }))
              }
              onBlur={(event) => {
                const message = validateField(
                  "productName",
                  event.target.value,
                );
                setErrors((prev) => ({
                  ...prev,
                  productName: message,
                }));
                setTouched((prev) => ({ ...prev, productName: true }));
              }}
              className={`h-10 w-full rounded-lg border px-3 text-sm text-foreground ${
                touched.productName && errors.productName
                  ? "border-destructive"
                  : "border-border"
              } bg-input-background`}
              required
            >
              <option value="">Select from Construction List</option>
              {mockConstructionItems.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {touched.productName && errors.productName && (
              <span className="text-xs text-destructive">
                {errors.productName}
              </span>
            )}
          </label>

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
                  const message = validateField(
                    "quantity",
                    event.target.value,
                  );
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
                  priority: event.target.value,
                }))
              }
              className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm text-foreground"
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
              className="min-h-[90px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground"
              placeholder="Special requirements or additional information..."
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
