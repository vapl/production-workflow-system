"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { useOrders } from "@/app/orders/OrdersContext";
import { useCurrentUser } from "@/contexts/UserContext";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/ui/FileField";
import { InputField } from "@/components/ui/InputField";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { SelectField } from "@/components/ui/SelectField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { supabase } from "@/lib/supabaseClient";
import { uploadExternalJobAttachment } from "@/lib/uploadExternalJobAttachment";
import type { ExternalJobStatus } from "@/types/orders";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ReceiveJob = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  partnerName: string;
  externalOrderNumber: string;
  partnerResponseOrderNumber?: string | null;
  requestMode?: "manual" | "partner_portal" | null;
  dueDate: string;
  quantity?: number;
  status: ExternalJobStatus;
  deliveryNoteNo?: string | null;
  partnerResponseNote?: string | null;
};

type ReceiveJobOrderJoin =
  | {
      order_number?: string | null;
      customer_name?: string | null;
    }
  | Array<{
      order_number?: string | null;
      customer_name?: string | null;
    }>
  | null
  | undefined;

type AiExtractFieldConfig = {
  id: string;
  key: string;
  label: string;
  fieldType: "text" | "textarea" | "number" | "date" | "select" | "toggle";
  options?: string[];
  isRequired?: boolean;
  aiMatchOnly?: boolean;
  aiAliases: string[];
};

const statusLabels: Record<ExternalJobStatus, string> = {
  requested: "Requested",
  ordered: "Ordered",
  in_progress: "In progress",
  delivered: "In Stock",
  approved: "Approved",
  cancelled: "Cancelled",
};

const statusVariant = (status: ExternalJobStatus) => {
  switch (status) {
    case "requested":
      return "status-pending";
    case "ordered":
      return "status-planned";
    case "in_progress":
      return "status-in_progress";
    case "delivered":
    case "approved":
      return "status-completed";
    case "cancelled":
      return "status-cancelled";
    default:
      return "secondary";
  }
};

export default function ExternalJobsReceivePage() {
  const { updateExternalJob, addExternalJobAttachment } = useOrders();
  const user = useCurrentUser();
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<ReceiveJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [actionState, setActionState] = useState<
    Record<
      string,
      {
        note: string;
        files?: File[];
        isSaving?: boolean;
        fieldValues?: Record<string, string>;
        matchValues?: Record<string, string>;
        aiSuggestedKeys?: string[];
        error?: string;
      }
    >
  >({});
  const [aiExtractFields, setAiExtractFields] = useState<
    AiExtractFieldConfig[]
  >([]);
  const [quickScanFiles, setQuickScanFiles] = useState<File[]>([]);
  const [isQuickScanMatching, setIsQuickScanMatching] = useState(false);
  const [quickScanMessage, setQuickScanMessage] = useState("");
  const [matchedJobId, setMatchedJobId] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= 768) {
        setShowCompactMobileTitle(false);
        return;
      }
      setShowCompactMobileTitle(window.scrollY > 90);
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;
    const fetchJobs = async () => {
      setIsLoading(true);
      if (!supabase) {
        setJobs([]);
        setIsLoading(false);
        return;
      }
      const query = supabase
        .from("external_jobs")
        .select(
          `
          id,
          order_id,
          partner_name,
          external_order_number,
          request_mode,
          partner_response_order_number,
          quantity,
          due_date,
          status,
          delivery_note_no,
          partner_response_note,
          orders (
            order_number,
            customer_name
          )
        `,
        )
        .in("status", ["ordered", "in_progress"])
        .order("created_at", { ascending: false });
      if (user.tenantId) {
        query.eq("tenant_id", user.tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setJobs([]);
        setIsLoading(false);
        return;
      }
      const orderIds = Array.from(
        new Set(
          (data ?? [])
            .map((row: { order_id?: string | null }) => row.order_id ?? null)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const orderFallback = new Map<
        string,
        { orderNumber: string; customerName: string }
      >();
      if (orderIds.length > 0) {
        const { data: orderRows } = await supabase
          .from("orders")
          .select("id, order_number, customer_name")
          .in("id", orderIds);
        (orderRows ?? []).forEach((row) => {
          if (typeof row.id !== "string") {
            return;
          }
          orderFallback.set(row.id, {
            orderNumber:
              typeof row.order_number === "string" ? row.order_number : "-",
            customerName:
              typeof row.customer_name === "string" ? row.customer_name : "-",
          });
        });
      }

      const mapped = (data ?? []).map(
        (row: {
          id: string;
          order_id: string;
          partner_name?: string | null;
          external_order_number: string;
          request_mode?: "manual" | "partner_portal" | null;
          partner_response_order_number?: string | null;
          quantity?: number | null;
          due_date: string;
          status: ExternalJobStatus;
          delivery_note_no?: string | null;
          partner_response_note?: string | null;
          orders?: ReceiveJobOrderJoin;
        }) => {
          const order = Array.isArray(row.orders)
            ? row.orders[0]
            : (row.orders ?? undefined);
          const fallback = orderFallback.get(row.order_id);
          return {
            id: row.id,
            orderId: row.order_id,
            orderNumber: order?.order_number ?? fallback?.orderNumber ?? "-",
            customerName: order?.customer_name ?? fallback?.customerName ?? "-",
            partnerName: row.partner_name ?? "-",
            externalOrderNumber: row.external_order_number,
            requestMode: row.request_mode ?? null,
            partnerResponseOrderNumber:
              row.partner_response_order_number ?? null,
            dueDate: row.due_date,
            quantity: row.quantity ?? undefined,
            status: row.status,
            deliveryNoteNo: row.delivery_note_no ?? null,
            partnerResponseNote: row.partner_response_note ?? null,
          };
        },
      );
      setJobs(mapped);
      setIsLoading(false);
    };
    void fetchJobs();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  useEffect(() => {
    if (!supabase || user.loading || !user.isAuthenticated || !user.tenantId) {
      return;
    }
    const sb = supabase;
    let isMounted = true;
    const loadAiFields = async () => {
      const { data, error } = await sb
        .from("external_job_fields")
        .select(
          "id, key, label, field_type, options, is_required, ai_aliases, ai_enabled, ai_match_only, is_active",
        )
        .eq("tenant_id", user.tenantId)
        .eq("is_active", true)
        .eq("ai_enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted || error) {
        return;
      }
      setAiExtractFields(
        (data ?? []).map((row) => ({
          id: row.id,
          key: row.key,
          label: row.label,
          fieldType: row.field_type as AiExtractFieldConfig["fieldType"],
          options: row.options?.options ?? undefined,
          isRequired: row.is_required ?? false,
          aiMatchOnly: row.ai_match_only ?? false,
          aiAliases: (row.ai_aliases ?? []).filter(
            (alias): alias is string => typeof alias === "string",
          ),
        })),
      );
    };
    void loadAiFields();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated, user.loading, user.tenantId]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return jobs;
    }
    return jobs.filter(
      (job) =>
        job.externalOrderNumber.toLowerCase().includes(q) ||
        job.partnerName.toLowerCase().includes(q) ||
        job.orderNumber.toLowerCase().includes(q) ||
        job.customerName.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const documentLikeFieldKeys = useMemo(
    () =>
      aiExtractFields
        .filter((field) =>
          /(document|delivery[_-]?note|invoice[_-]?(no|number)|contract[_-]?(no|number))/i.test(
            field.key,
          ),
        )
        .map((field) => field.key),
    [aiExtractFields],
  );

  const compareOnlyFieldKeys = useMemo(
    () =>
      aiExtractFields
        .filter((field) => field.aiMatchOnly)
        .map((field) => field.key),
    [aiExtractFields],
  );

  const editableAiFields = useMemo(
    () =>
      aiExtractFields.filter(
        (field) => !compareOnlyFieldKeys.includes(field.key),
      ),
    [aiExtractFields, compareOnlyFieldKeys],
  );

  const getDocumentNumberFromValues = (values?: Record<string, string>) =>
    documentLikeFieldKeys
      .map((key) => values?.[key] ?? "")
      .find((value) => value.trim().length > 0) ?? "";

  const normalizeToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const buildAiRequestFormData = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "fields",
      JSON.stringify(
        aiExtractFields.map((field) => ({
          key: field.key,
          label: field.label,
          fieldType: field.fieldType,
          aliases: field.aiAliases,
        })),
      ),
    );
    return formData;
  };

  const extractWithAiForFile = async (file: File) => {
    const response = await fetch("/api/external-documents/ai-extract", {
      method: "POST",
      body: buildAiRequestFormData(file),
    });
    const payload = (await response.json()) as {
      fields?: Record<string, string>;
      error?: string;
    };
    if (!response.ok || !payload.fields) {
      return { error: payload.error ?? "AI extraction failed." } as const;
    }
    return { fields: payload.fields } as const;
  };

  const handleFileChange = (jobId: string, files?: FileList | null) => {
    const nextFiles = files ? Array.from(files) : [];
    setActionState((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        files: nextFiles,
      },
    }));
  };

  const handleNoteChange = (jobId: string, note: string) => {
    setActionState((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        note,
      },
    }));
  };

  const handleReceive = async (job: ReceiveJob) => {
    const state = actionState[job.id];
    const missingRequiredField = editableAiFields.find((field) => {
      if (!field.isRequired) {
        return false;
      }
      const value = state?.fieldValues?.[field.key];
      if (field.fieldType === "toggle") {
        return value === undefined;
      }
      return !value || value.trim().length === 0;
    });
    if (missingRequiredField) {
      setActionState((prev) => ({
        ...prev,
        [job.id]: {
          ...prev[job.id],
          error: `Fill required field: ${missingRequiredField.label}.`,
        },
      }));
      return;
    }
    setActionState((prev) => ({
      ...prev,
      [job.id]: {
        ...prev[job.id],
        isSaving: true,
        error: undefined,
      },
    }));
    const partnerResponseNote = state?.note?.trim() || null;
    const now = new Date().toISOString();
    const updated = await updateExternalJob(job.id, {
      status: "delivered",
      partnerResponseNote,
      receivedAt: now,
      receivedBy: user.id,
    });
    if (!updated) {
      setActionState((prev) => ({
        ...prev,
        [job.id]: { ...prev[job.id], isSaving: false, error: "Save failed." },
      }));
      return;
    }

    if (state?.files && state.files.length > 0) {
      for (const file of state.files) {
        const upload = await uploadExternalJobAttachment(file, job.id);
        if (upload.error || !upload.attachment) {
          setActionState((prev) => ({
            ...prev,
            [job.id]: {
              ...prev[job.id],
              isSaving: false,
              error: upload.error ?? `Upload failed for ${file.name}.`,
            },
          }));
          return;
        }
        const attachment = await addExternalJobAttachment(job.id, {
          name: upload.attachment.name,
          url: upload.attachment.url,
          size: upload.attachment.size,
          mimeType: upload.attachment.mimeType,
          addedBy: user.name,
          addedByRole: user.role,
          category: "delivery_note",
        });
        if (!attachment) {
          setActionState((prev) => ({
            ...prev,
            [job.id]: {
              ...prev[job.id],
              isSaving: false,
              error: `Failed to attach ${file.name}.`,
            },
          }));
          return;
        }
      }
    }

    if (supabase && user.tenantId && state?.fieldValues) {
      const rows = editableAiFields
        .map((field) => {
          const raw = state.fieldValues?.[field.key];
          if (raw === undefined || raw === null) {
            return null;
          }
          const value = raw.trim();
          if (field.fieldType !== "toggle" && value.length === 0) {
            return null;
          }
          const typedValue: unknown =
            field.fieldType === "number"
              ? Number.isFinite(Number(value))
                ? Number(value)
                : value
              : field.fieldType === "toggle"
                ? value === "true"
                : value;
          return {
            tenant_id: user.tenantId,
            external_job_id: job.id,
            field_id: field.id,
            value: typedValue,
          };
        })
        .filter(
          (
            row,
          ): row is {
            tenant_id: string;
            external_job_id: string;
            field_id: string;
            value: string;
          } => Boolean(row),
        );
      if (rows.length > 0) {
        const { error } = await supabase
          .from("external_job_field_values")
          .upsert(rows, {
            onConflict: "external_job_id,field_id",
          });
        if (error) {
          setActionState((prev) => ({
            ...prev,
            [job.id]: {
              ...prev[job.id],
              isSaving: false,
              error: "Failed to save AI extracted fields.",
            },
          }));
          return;
        }
      }
    }

    setJobs((prev) => prev.filter((item) => item.id !== job.id));
    setActionState((prev) => ({
      ...prev,
      [job.id]: {
        note: "",
        files: [],
        fieldValues: {},
        aiSuggestedKeys: [],
        isSaving: false,
      },
    }));
  };

  const applyAiSuggestionsToJob = (
    jobId: string,
    fields: Record<string, string>,
    filesToAttach: File[],
  ) => {
    setActionState((prev) => {
      const current = prev[jobId] ?? { note: "" };
      const nextFields = Object.fromEntries(
        Object.entries(fields).filter(
          ([key]) => !compareOnlyFieldKeys.includes(key),
        ),
      );
      const nextMatchFields = Object.fromEntries(
        Object.entries(fields).filter(([key]) =>
          compareOnlyFieldKeys.includes(key),
        ),
      );
      const documentValue = documentLikeFieldKeys
        .map((key) => nextFields[key] ?? "")
        .find((value) => value.trim().length > 0);
      return {
        ...prev,
        [jobId]: {
          ...current,
          note: current.note || documentValue || "",
          files: [...(current.files ?? []), ...filesToAttach],
          fieldValues: {
            ...(current.fieldValues ?? {}),
            ...nextFields,
          },
          matchValues: {
            ...(current.matchValues ?? {}),
            ...nextMatchFields,
          },
          aiSuggestedKeys: Object.entries(nextFields)
            .filter(([, value]) => value.trim().length > 0)
            .map(([key]) => key),
          error: undefined,
        },
      };
    });
  };

  const handleQuickScanMatch = async () => {
    const firstFile = quickScanFiles[0];
    if (!firstFile) {
      setQuickScanMessage("Attach or scan a document first.");
      return;
    }
    if (aiExtractFields.length === 0) {
      setQuickScanMessage(
        "Enable AI extract fields in Settings -> External job schema.",
      );
      return;
    }
    setIsQuickScanMatching(true);
    setQuickScanMessage("");
    try {
      const result = await extractWithAiForFile(firstFile);
      if ("error" in result) {
        setQuickScanMessage(result.error ?? "AI extraction failed.");
        setIsQuickScanMatching(false);
        return;
      }
      const identifiers = Object.entries(result.fields)
        .filter(
          ([key, value]) =>
            value.trim().length > 0 &&
            (documentLikeFieldKeys.includes(key) ||
              /invoice|document|contract|order/i.test(key)),
        )
        .map(([, value]) => normalizeToken(value));
      const uniqueIdentifiers = Array.from(new Set(identifiers)).filter(
        (value) => value.length > 0,
      );
      if (uniqueIdentifiers.length === 0) {
        setQuickScanMessage("No matching identifier extracted from document.");
        setIsQuickScanMatching(false);
        return;
      }
      const matched = jobs.filter((job) => {
        const tokens = [
          normalizeToken(job.externalOrderNumber ?? ""),
          normalizeToken(job.partnerResponseOrderNumber ?? ""),
          normalizeToken(job.deliveryNoteNo ?? ""),
        ].filter((value) => value.length > 0);
        return uniqueIdentifiers.some((id) => tokens.includes(id));
      });
      if (matched.length === 0) {
        setQuickScanMessage(
          "No matching partner order found. Use manual search.",
        );
        setIsQuickScanMatching(false);
        return;
      }
      if (matched.length > 1) {
        setSearch(uniqueIdentifiers[0] ?? "");
        setQuickScanMessage(
          "Multiple matches found. Refine using search and confirm manually.",
        );
        setIsQuickScanMatching(false);
        return;
      }
      const target = matched[0];
      applyAiSuggestionsToJob(target.id, result.fields, [firstFile]);
      setMatchedJobId(target.id);
      setSearch(target.externalOrderNumber);
      const matchedDocNo = getDocumentNumberFromValues(result.fields);
      const matchedExtOrder =
        target.requestMode === "partner_portal"
          ? target.partnerResponseOrderNumber || target.externalOrderNumber
          : target.externalOrderNumber;
      setQuickScanMessage(
        matchedDocNo
          ? `Matched invoice/document no: ${matchedDocNo}`
          : `Matched Ext. Order: ${matchedExtOrder || "--"}`,
      );
      setQuickScanFiles([]);
    } finally {
      setIsQuickScanMatching(false);
    }
  };

  const handleExternalFieldValueChange = (
    jobId: string,
    key: string,
    value: string,
  ) => {
    setActionState((prev) => {
      const current = prev[jobId] ?? { note: "" };
      return {
        ...prev,
        [jobId]: {
          ...current,
          fieldValues: {
            ...(current.fieldValues ?? {}),
            [key]: value,
          },
          aiSuggestedKeys: (current.aiSuggestedKeys ?? []).filter(
            (item) => item !== key,
          ),
        },
      };
    });
  };

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 md:hidden">
        <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
          <Link href="/orders/external">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to partner orders"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-30 md:hidden">
        <div className="flex items-center justify-start">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full bg-card shadow-lg"
            aria-label="Open receive search"
            onClick={() => setIsMobileSearchOpen(true)}
          >
            <SearchIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <BottomSheet
        open={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
        ariaLabel="Search partner orders to receive"
        closeButtonLabel="Close search"
        title="Search"
        enableSwipeToClose
      >
        <div className="px-4 pt-3">
          <Input
            type="search"
            icon="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order #, partner, customer, external order..."
            className="text-[16px] md:text-sm"
          />
        </div>
      </BottomSheet>

      <div className="space-y-0 pt-16 pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:space-y-4 md:pt-0 md:pb-0">
        <MobilePageTitle
          title="Receive partner orders"
          showCompact={showCompactMobileTitle}
          subtitle="Mark delivered items as In Stock and attach delivery notes."
          className="pt-6 pb-6"
        />

        <DesktopPageHeader
          sticky
          title="Partner Orders - Receive"
          subtitle="Mark delivered items as In Stock and attach delivery notes."
          className="md:z-20"
          actions={
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/orders/external">
                <Button variant="outline" size="lg">
                  Back to Partner Orders
                </Button>
              </Link>
            </div>
          }
        />
        <div className="hidden md:block">
          <InputField
            label="Search"
            icon="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order #, partner, customer, external order..."
            className="h-10 text-sm"
          />
        </div>
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="text-sm font-medium">Quick receive scanner</div>
            <FileField
              label="Scan or upload supplier document"
              enableScan
              scanButtonLabel="Scan document"
              onChange={(event) =>
                setQuickScanFiles(
                  event.target.files ? Array.from(event.target.files) : [],
                )
              }
              description={
                quickScanFiles.length > 0
                  ? `Attached: ${quickScanFiles.map((file) => file.name).join(", ")}`
                  : "Scan once to auto-match and prefill a partner order card."
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleQuickScanMatch}
                disabled={isQuickScanMatching}
              >
                <SparklesIcon className="h-4 w-4" />
                {isQuickScanMatching ? "Matching..." : "Scan and match"}
              </Button>
              {quickScanMessage ? (
                <span className="text-xs text-muted-foreground">
                  {quickScanMessage}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Loading partner orders...
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No partner orders waiting for receive.
            </div>
          ) : (
            filteredJobs.map((job) => {
              const state = actionState[job.id];
              const displayExternalOrder =
                job.requestMode === "partner_portal"
                  ? job.partnerResponseOrderNumber || job.externalOrderNumber
                  : job.externalOrderNumber;
              const headerMatchFields = aiExtractFields.filter(
                (field) => field.aiMatchOnly,
              );
              return (
                <Card
                  key={job.id}
                  className={
                    matchedJobId === job.id
                      ? "border-primary ring-1 ring-primary/20"
                      : undefined
                  }
                >
                  <CardContent className="space-y-2.5 pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-6">
                        {headerMatchFields.map((field) => (
                          <div key={`${job.id}-match-${field.id}`}>
                            <div className="text-xs text-muted-foreground">
                              {field.label}
                            </div>
                            <div className="text-sm font-semibold leading-tight">
                              {state?.matchValues?.[field.key] ||
                                (/(external[_-]?order|partner[_-]?order|ext[_-]?order)/i.test(
                                  field.key,
                                )
                                  ? displayExternalOrder
                                  : "--")}
                            </div>
                          </div>
                        ))}
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Order #
                          </div>
                          <div className="text-sm font-medium leading-tight">
                            {job.orderNumber && job.orderNumber !== "-"
                              ? job.orderNumber
                              : "Not linked"}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground sm:pt-4">
                          Customer: {job.customerName || "--"} · Partner:{" "}
                          {job.partnerName} · Due: {job.dueDate}
                          {job.quantity ? ` · Qty ${job.quantity}` : ""}
                        </div>
                      </div>
                      <Badge variant={statusVariant(job.status)}>
                        {statusLabels[job.status]}
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-1 md:items-start">
                      <div className="grid md:grid-cols-1 gap-3">
                        <FileField
                          label="Delivery note file (optional)"
                          multiple
                          enableScan
                          scanButtonLabel="Scan document"
                          onChange={(event) =>
                            handleFileChange(job.id, event.target.files)
                          }
                          description={
                            state?.files && state.files.length > 0
                              ? `Attached: ${state.files.map((file) => file.name).join(", ")}`
                              : undefined
                          }
                          className="min-h-20 py-3 text-sm"
                        />
                        {state?.aiSuggestedKeys &&
                        state.aiSuggestedKeys.length > 0 ? (
                          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            <div className="mb-1 text-foreground">
                              AI extracted
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {aiExtractFields
                                .filter(
                                  (field) =>
                                    !compareOnlyFieldKeys.includes(field.key),
                                )
                                .map((field) => ({
                                  label: field.label,
                                  value:
                                    state.fieldValues?.[field.key]?.trim() ??
                                    "",
                                }))
                                .filter((item) => item.value.length > 0)
                                .map((item) => (
                                  <span key={`${job.id}-${item.label}`}>
                                    {item.label}: {item.value}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ) : null}
                        {editableAiFields.length > 0 ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            {editableAiFields.map((field) => {
                              const value =
                                state?.fieldValues?.[field.key] ?? "";
                              const isAiSuggested =
                                state?.aiSuggestedKeys?.includes(field.key) ??
                                false;
                              const label = isAiSuggested
                                ? `${field.label} (AI suggestion)`
                                : field.label;
                              if (field.fieldType === "textarea") {
                                return (
                                  <TextAreaField
                                    key={`${job.id}-${field.key}`}
                                    label={label}
                                    value={value}
                                    onChange={(event) =>
                                      handleExternalFieldValueChange(
                                        job.id,
                                        field.key,
                                        event.target.value,
                                      )
                                    }
                                    className="min-h-20"
                                  />
                                );
                              }
                              if (field.fieldType === "select") {
                                return (
                                  <SelectField
                                    key={`${job.id}-${field.key}`}
                                    label={label}
                                    value={value || "__empty__"}
                                    onValueChange={(next) =>
                                      handleExternalFieldValueChange(
                                        job.id,
                                        field.key,
                                        next === "__empty__" ? "" : next,
                                      )
                                    }
                                  >
                                    <Select
                                      value={value || "__empty__"}
                                      onValueChange={(next) =>
                                        handleExternalFieldValueChange(
                                          job.id,
                                          field.key,
                                          next === "__empty__" ? "" : next,
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-10 w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__empty__">
                                          Select value
                                        </SelectItem>
                                        {(field.options ?? []).map((option) => (
                                          <SelectItem
                                            key={option}
                                            value={option}
                                          >
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SelectField>
                                );
                              }
                              if (field.fieldType === "toggle") {
                                return (
                                  <div
                                    key={`${job.id}-${field.key}`}
                                    className="space-y-1"
                                  >
                                    <div className="text-sm font-medium">
                                      {label}
                                    </div>
                                    <Checkbox
                                      checked={value === "true"}
                                      onChange={(event) =>
                                        handleExternalFieldValueChange(
                                          job.id,
                                          field.key,
                                          event.target.checked
                                            ? "true"
                                            : "false",
                                        )
                                      }
                                      label={value === "true" ? "Yes" : "No"}
                                    />
                                  </div>
                                );
                              }
                              return (
                                <InputField
                                  key={`${job.id}-${field.key}`}
                                  label={label}
                                  type={
                                    field.fieldType === "number"
                                      ? "number"
                                      : field.fieldType === "date"
                                        ? "date"
                                        : "text"
                                  }
                                  value={value}
                                  onChange={(event) =>
                                    handleExternalFieldValueChange(
                                      job.id,
                                      field.key,
                                      event.target.value,
                                    )
                                  }
                                  className="h-10 text-sm"
                                />
                              );
                            })}
                          </div>
                        ) : null}
                        <TextAreaField
                          label="Comment (optional)"
                          value={state?.note ?? job.partnerResponseNote ?? ""}
                          onChange={(event) =>
                            handleNoteChange(job.id, event.target.value)
                          }
                          placeholder="Add comment for receiving"
                          className="min-h-20 text-sm"
                        />
                      </div>
                      <div className="w-full space-y-2">
                        <div className="flex w-full items-stretch gap-2 md:w-auto md:items-center">
                          <Button
                            onClick={() => handleReceive(job)}
                            disabled={state?.isSaving}
                            className="flex-1 md:w-fit md:flex-none"
                          >
                            {state?.isSaving ? (
                              <LoadingSpinner
                                label="Save"
                                className="mr-2 flex"
                              />
                            ) : (
                              <span>Mark In Stock</span>
                            )}
                          </Button>
                        </div>
                        {state?.error ? (
                          <span className="text-xs text-destructive">
                            {state.error}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
