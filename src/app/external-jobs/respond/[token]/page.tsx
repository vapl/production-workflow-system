"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";

type RequestPayload = {
  partnerName: string;
  orderNumber: string;
  customerName: string;
  externalOrderNumber: string;
  dueDate: string;
  companyName?: string;
  companyLogoUrl?: string | null;
  companyBillingEmail?: string;
  companyAddress?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
};

type RequestResponse = {
  request: RequestPayload;
  attachments: Array<{ id: string; name: string; url: string }>;
  fields: Array<{
    id: string;
    key: string;
    label: string;
    fieldType: "text" | "textarea" | "number" | "date" | "select" | "toggle";
    isRequired: boolean;
    options: string[];
    value: unknown;
  }>;
};

function formatDate(value: string) {
  if (!value) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("lv-LV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getFieldSemantic(field: { key: string; label: string }) {
  const tokens = new Set([
    normalizeToken(field.key),
    normalizeToken(field.label),
  ]);
  if (
    tokens.has("external_order_number") ||
    tokens.has("external_order_no") ||
    tokens.has("order_number") ||
    tokens.has("ext_order")
  ) {
    return "external_order";
  }
  if (tokens.has("due_date") || tokens.has("due")) {
    return "due_date";
  }
  return "other";
}

export default function ExternalJobRespondPage() {
  const params = useParams<{ token?: string }>();
  const token = params?.token ?? "";
  const hasToken = token.trim().length > 0;
  const [isLoading, setIsLoading] = useState(hasToken);
  const [requestData, setRequestData] = useState<RequestResponse | null>(null);
  const [error, setError] = useState("");
  const [fallbackPartnerOrderNumber, setFallbackPartnerOrderNumber] =
    useState("");
  const [fallbackCompletionDate, setFallbackCompletionDate] = useState("");
  const [note, setNote] = useState("");
  const [portalFieldValues, setPortalFieldValues] = useState<
    Record<string, string | boolean>
  >({});
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!hasToken) {
      return;
    }
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setError("");
      const response = await fetch(`/api/external-jobs/respond/${token}`);
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<RequestResponse>;
      if (!isMounted) {
        return;
      }
      if (!response.ok || !payload.request) {
        setError(payload.error ?? "Failed to load request.");
        setIsLoading(false);
        return;
      }
      const uniqueFields = Array.from(
        new Map(
          (payload.fields ?? []).map((field) => [field.id, field]),
        ).values(),
      );
      setRequestData({
        request: payload.request,
        attachments: payload.attachments ?? [],
        fields: uniqueFields,
      });
      setFallbackCompletionDate(payload.request.dueDate ?? "");
      setPortalFieldValues(
        uniqueFields.reduce<Record<string, string | boolean>>((acc, field) => {
          if (field.fieldType === "toggle") {
            acc[field.id] = field.value === true;
            return acc;
          }
          acc[field.id] =
            typeof field.value === "string" || typeof field.value === "number"
              ? String(field.value)
              : "";
          return acc;
        }, {}),
      );
      setIsLoading(false);
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [hasToken, token]);

  const externalOrderField = useMemo(
    () =>
      (requestData?.fields ?? []).find(
        (field) => getFieldSemantic(field) === "external_order",
      ),
    [requestData?.fields],
  );
  const completionDateField = useMemo(
    () =>
      (requestData?.fields ?? []).find(
        (field) => getFieldSemantic(field) === "due_date",
      ),
    [requestData?.fields],
  );
  const displayCompanyName = requestData?.request.companyName?.trim() || "-";

  const partnerOrderNumber = externalOrderField
    ? String(portalFieldValues[externalOrderField.id] ?? "").trim()
    : fallbackPartnerOrderNumber.trim();
  const completionDate = completionDateField
    ? String(portalFieldValues[completionDateField.id] ?? "").trim()
    : fallbackCompletionDate.trim();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partnerOrderNumber.trim()) {
      setError("Your order number is required.");
      return;
    }
    if (!completionDate.trim()) {
      setError("Completion date is required.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    const form = new FormData();
    form.set("partnerOrderNumber", partnerOrderNumber.trim());
    form.set("completionDate", completionDate.trim());
    form.set("note", note.trim());
    (requestData?.fields ?? []).forEach((field) => {
      const value = portalFieldValues[field.id];
      if (field.fieldType === "toggle") {
        form.set(`field_${field.id}`, value === true ? "true" : "false");
        return;
      }
      form.set(`field_${field.id}`, typeof value === "string" ? value : "");
    });
    if (file) {
      form.set("file", file);
    }
    const response = await fetch(`/api/external-jobs/respond/${token}`, {
      method: "POST",
      body: form,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Failed to submit response.");
      setIsSubmitting(false);
      return;
    }
    setSubmitted(true);
    setIsSubmitting(false);
  }

  if (!hasToken) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-8">
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Invalid link.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-8">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Loading request...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !requestData) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-8">
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!requestData) {
    return null;
  }

  if (submitted) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Thank you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Your response was received.</p>
            <p>Order: {requestData.request.orderNumber}</p>
            <p>
              {externalOrderField?.label ?? "Your order number"}:{" "}
              {partnerOrderNumber}
            </p>
            <p>Completion date: {formatDate(completionDate)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>External Job Response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            {requestData.request.companyLogoUrl ? (
              <Image
                src={requestData.request.companyLogoUrl}
                alt={
                  displayCompanyName === "-"
                    ? "Company logo"
                    : displayCompanyName
                }
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground">
                {(requestData.request.companyName ?? "Co")
                  .trim()
                  .replace(/^$/, "Co")
                  .split(" ")
                  .filter(Boolean)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{displayCompanyName}</div>
            </div>
          </div>
          <p>
            <span className="text-muted-foreground">Order:</span>{" "}
            {requestData.request.orderNumber}
          </p>
          {requestData.request.companyBillingEmail ? (
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {requestData.request.companyBillingEmail}
            </p>
          ) : null}
          {requestData.request.companyAddress ? (
            <p>
              <span className="text-muted-foreground">Address:</span>{" "}
              {requestData.request.companyAddress}
            </p>
          ) : null}
          {requestData.request.senderName ? (
            <p>
              <span className="text-muted-foreground">Sent by:</span>{" "}
              {requestData.request.senderName}
            </p>
          ) : null}
          {requestData.request.senderEmail ? (
            <p>
              <span className="text-muted-foreground">Contact email:</span>{" "}
              {requestData.request.senderEmail}
            </p>
          ) : null}
          {requestData.request.senderPhone ? (
            <p>
              <span className="text-muted-foreground">Contact phone:</span>{" "}
              {requestData.request.senderPhone}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {requestData.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {requestData.attachments.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block text-primary underline"
              >
                {item.name}
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Submit Response</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!externalOrderField ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Your order number
                <input
                  value={fallbackPartnerOrderNumber}
                  onChange={(event) =>
                    setFallbackPartnerOrderNumber(event.target.value)
                  }
                  className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                  required
                />
              </label>
            ) : null}
            {!completionDateField ? (
              <DatePicker
                label="Completion date"
                value={fallbackCompletionDate}
                onChange={setFallbackCompletionDate}
                className="space-y-2 text-sm font-medium"
                triggerClassName="h-10"
              />
            ) : null}
            {(requestData.fields ?? []).map((field) => {
              const value = portalFieldValues[field.id];
              const label = `${field.label}${field.isRequired ? " *" : ""}`;
              if (field.fieldType === "toggle") {
                return (
                  <label
                    key={field.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-input-background px-3 py-2 text-sm font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) =>
                        setPortalFieldValues((prev) => ({
                          ...prev,
                          [field.id]: event.target.checked,
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                );
              }
              if (field.fieldType === "textarea") {
                return (
                  <label
                    key={field.id}
                    className="flex flex-col gap-2 text-sm font-medium"
                  >
                    {label}
                    <textarea
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        setPortalFieldValues((prev) => ({
                          ...prev,
                          [field.id]: event.target.value,
                        }))
                      }
                      className="min-h-25 rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
                      required={field.isRequired}
                    />
                  </label>
                );
              }
              if (field.fieldType === "select") {
                return (
                  <label
                    key={field.id}
                    className="flex flex-col gap-2 text-sm font-medium"
                  >
                    {label}
                    <select
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        setPortalFieldValues((prev) => ({
                          ...prev,
                          [field.id]: event.target.value,
                        }))
                      }
                      className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                      required={field.isRequired}
                    >
                      <option value="">Select value</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (field.fieldType === "date") {
                return (
                  <DatePicker
                    key={field.id}
                    label={label}
                    value={typeof value === "string" ? value : ""}
                    onChange={(next) =>
                      setPortalFieldValues((prev) => ({
                        ...prev,
                        [field.id]: next,
                      }))
                    }
                    className="space-y-2 text-sm font-medium"
                    triggerClassName="h-10"
                  />
                );
              }
              return (
                <label
                  key={field.id}
                  className="flex flex-col gap-2 text-sm font-medium"
                >
                  {label}
                  <input
                    type={field.fieldType === "number" ? "number" : "text"}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) =>
                      setPortalFieldValues((prev) => ({
                        ...prev,
                        [field.id]: event.target.value,
                      }))
                    }
                    className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm"
                    required={field.isRequired}
                  />
                </label>
              );
            })}
            <label className="flex flex-col gap-2 text-sm font-medium">
              Note (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-25 rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Attachment (optional)
              <input
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
