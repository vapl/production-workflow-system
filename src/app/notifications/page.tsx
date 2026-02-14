"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DatePicker } from "@/components/ui/DatePicker";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { FilterOptionSelector } from "@/components/ui/StatusChipsFilter";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
};

function notificationBadgeClass(type?: string) {
  if (type === "blocked") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  if (type === "resumed") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (type === "done") {
    return "border-sky-300 bg-sky-50 text-sky-700";
  }
  return "border-border bg-muted text-muted-foreground";
}

function notificationBadgeLabel(type?: string) {
  if (type === "blocked") return "Blocked";
  if (type === "resumed") return "Resumed";
  if (type === "done") return "Done";
  return "Info";
}

type NotificationStatusFilter = "all" | "blocked" | "resumed" | "done" | "info";

function formatNotificationBody(body?: string | null) {
  if (!body) return null;
  if (body.includes("\n")) return body;
  const legacy = body.match(/^(.*?) at (.*?)\. (.*?)(?: \(by (.*?)\))?\.$/);
  if (!legacy) return body;
  const [, item, station, actionOrReason, actor] = legacy;
  const actorLine = actor ? `\nBy: ${actor}` : "";
  return `Item: ${item}\nStation: ${station}\nAction: ${actionOrReason}${actorLine}`;
}

function notificationBodyRows(body?: string | null) {
  const formatted = formatNotificationBody(body);
  if (!formatted) return [];
  return formatted
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) {
        return { label: "", value: line.trim() };
      }
      return {
        label: line.slice(0, idx).trim(),
        value: line.slice(idx + 1).trim(),
      };
    })
    .filter((row) => row.value.length > 0);
}

export default function NotificationsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [statusFilter, setStatusFilter] =
    useState<NotificationStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [deletingAllRead, setDeletingAllRead] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

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
    if (!supabase || !user.isAuthenticated) {
      return;
    }
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      const query = supabase!
        .from("notifications")
        .select("id, type, title, body, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(100);
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      setIsLoading(false);
      if (error || !data) {
        return;
      }
      setItems(data as NotificationItem[]);
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [user.isAuthenticated]);

  useEffect(() => {
    if (!supabase || !user.tenantId) {
      return;
    }
    const channel = supabase
      .channel(`notifications-page-${user.tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const next = payload.new as NotificationItem;
          setItems((prev) => [next, ...prev]);
        },
      )
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [user.tenantId]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (showUnreadOnly && item.read_at) {
        return false;
      }

      const itemType = (item.type ?? "").toLowerCase();
      if (statusFilter !== "all") {
        if (statusFilter === "info") {
          if (["blocked", "resumed", "done"].includes(itemType)) {
            return false;
          }
        } else if (itemType !== statusFilter) {
          return false;
        }
      }

      const day = item.created_at?.slice(0, 10) ?? "";
      if (dateFrom && day < dateFrom) {
        return false;
      }
      if (dateTo && day > dateTo) {
        return false;
      }
      return true;
    });
  }, [items, showUnreadOnly, statusFilter, dateFrom, dateTo]);

  const statusCounts = useMemo(() => {
    const base = items.filter((item) => {
      if (showUnreadOnly && item.read_at) {
        return false;
      }
      const day = item.created_at?.slice(0, 10) ?? "";
      if (dateFrom && day < dateFrom) {
        return false;
      }
      if (dateTo && day > dateTo) {
        return false;
      }
      return true;
    });
    return {
      all: base.length,
      blocked: base.filter((item) => (item.type ?? "").toLowerCase() === "blocked")
        .length,
      resumed: base.filter((item) => (item.type ?? "").toLowerCase() === "resumed")
        .length,
      done: base.filter((item) => (item.type ?? "").toLowerCase() === "done").length,
      info: base.filter(
        (item) =>
          !["blocked", "resumed", "done"].includes((item.type ?? "").toLowerCase()),
      ).length,
    };
  }, [items, showUnreadOnly, dateFrom, dateTo]);

  const markAllRead = async () => {
    if (!supabase) {
      return;
    }
    const ids = visibleItems
      .filter((item) => !item.read_at)
      .map((item) => item.id);
    if (ids.length === 0) {
      return;
    }
    if (markingAllRead) {
      return;
    }
    setMarkingAllRead(true);
    try {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          read_at: item.read_at ?? new Date().toISOString(),
        })),
      );
    } finally {
      setMarkingAllRead(false);
    }
  };

  const markRead = async (id: string) => {
    if (!supabase) {
      return;
    }
    if (markingId === id) {
      return;
    }
    setMarkingId(id);
    try {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
            : item,
        ),
      );
    } finally {
      setMarkingId(null);
    }
  };

  const deleteNotification = async (id: string) => {
    if (!supabase) {
      return;
    }
    const shouldDelete = await confirm({
      title: "Delete notification?",
      description: "This will permanently remove the notification.",
      confirmLabel: "Delete",
    });
    if (!shouldDelete) {
      return;
    }
    if (deletingId === id) {
      return;
    }
    setDeletingId(id);
    try {
      await supabase.from("notifications").delete().eq("id", id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllRead = async () => {
    if (!supabase) {
      return;
    }
    const readIds = visibleItems
      .filter((item) => item.read_at)
      .map((item) => item.id);
    if (readIds.length === 0) {
      return;
    }
    const shouldDelete = await confirm({
      title: "Delete read notifications?",
      description: `This will delete ${readIds.length} read notification(s).`,
      confirmLabel: "Delete",
    });
    if (!shouldDelete) {
      return;
    }
    if (deletingAllRead) {
      return;
    }
    setDeletingAllRead(true);
    try {
      await supabase.from("notifications").delete().in("id", readIds);
      setItems((prev) => prev.filter((item) => !item.read_at));
    } finally {
      setDeletingAllRead(false);
    }
  };

  const renderFilterControls = (isDesktop = false) => (
    <div className={isDesktop ? "space-y-3" : "space-y-3"}>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showUnreadOnly}
          onChange={(event) => setShowUnreadOnly(event.target.checked)}
        />
        Unread only
      </label>
      <div className="h-px bg-border/70" />
      <FilterOptionSelector
        title="Status"
        value={statusFilter}
        onChange={(value) => setStatusFilter(value as NotificationStatusFilter)}
        options={[
          { value: "all", label: "All", count: statusCounts.all },
          { value: "blocked", label: "Blocked", count: statusCounts.blocked },
          { value: "resumed", label: "Resumed", count: statusCounts.resumed },
          { value: "done", label: "Done", count: statusCounts.done },
          { value: "info", label: "Info", count: statusCounts.info },
        ]}
      />
      <div className="h-px bg-border/70" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DatePicker
          label="From"
          value={dateFrom}
          onChange={setDateFrom}
          triggerClassName="h-9"
        />
        <DatePicker
          label="To"
          value={dateTo}
          onChange={setDateTo}
          min={dateFrom || undefined}
          triggerClassName="h-9"
        />
      </div>
      <div className="h-px bg-border/70" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setShowUnreadOnly(false);
          setStatusFilter("all");
          setDateFrom("");
          setDateTo("");
        }}
        className={isDesktop ? "gap-2" : "gap-2 w-full"}
      >
        Reset filters
      </Button>
    </div>
  );

  const renderActionControls = (isDesktop = false) => (
    <div className={isDesktop ? "flex items-center gap-2" : "flex flex-col gap-2"}>
      <Button
        variant="outline"
        size="sm"
        onClick={markAllRead}
        className={isDesktop ? "gap-2" : "gap-2 w-full"}
        disabled={markingAllRead}
      >
        {markingAllRead ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        ) : null}
        Mark all read
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={deleteAllRead}
        className={isDesktop ? "gap-2" : "gap-2 w-full"}
        disabled={deletingAllRead}
      >
        {deletingAllRead ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        ) : null}
        Delete all read
      </Button>
    </div>
  );

  const renderDesktopToolbar = () => (
    <div className="flex items-center gap-2">
      <FiltersDropdown contentClassName="w-[360px]">
        {renderFilterControls(true)}
      </FiltersDropdown>
      <div className="mx-1 h-6 w-px bg-border" />
      {renderActionControls(true)}
    </div>
  );

  return (
    <section className="space-y-0 md:space-y-4 pt-16 md:pt-0">
      <BottomSheet
        open={isMobileActionsOpen}
        onClose={() => setIsMobileActionsOpen(false)}
        ariaLabel="Notifications filters and actions"
        title="Filters and actions"
        showHandle
        enableSwipeToClose
        panelClassName="pb-[max(6rem,env(safe-area-inset-bottom))]"
      >
        <div className="space-y-4 p-4">
          {renderFilterControls(false)}
          <div className="h-px bg-border" />
          {renderActionControls(false)}
        </div>
      </BottomSheet>

      <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 md:hidden">
        <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }
              router.push("/orders");
            }}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-30 md:hidden">
        <div className="flex items-center justify-start">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full bg-card shadow-lg"
            aria-label="Open notification actions"
            onClick={() => setIsMobileActionsOpen(true)}
          >
            <SlidersHorizontalIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <MobilePageTitle
        title="Notifications"
        showCompact={showCompactMobileTitle}
        subtitle="Review system updates, unread alerts, and workflow events."
        className="pt-6 pb-6"
      />

      <DesktopPageHeader
        sticky
        title="Notifications"
        subtitle="Review system updates, unread alerts, and workflow events."
        className="md:z-20"
        actions={renderDesktopToolbar()}
      />

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Loading notifications...
          </div>
        ) : null}
        {!isLoading && visibleItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No notifications found.
          </div>
        ) : null}
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border border-border px-3 py-2 text-xs ${
              item.read_at ? "text-muted-foreground" : "bg-muted/30"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${notificationBadgeClass(item.type)}`}
                  >
                    {notificationBadgeLabel(item.type)}
                  </span>
                </div>
                <div className="font-medium text-foreground">{item.title}</div>
                {item.body ? (
                  <div className="mt-2 space-y-1 rounded-md border border-border/70 bg-muted/20 px-2 py-1.5 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-1 md:space-y-0">
                    {notificationBodyRows(item.body).map((row, idx) => (
                      <div
                        key={`${item.id}-row-${idx}`}
                        className="flex gap-1.5"
                      >
                        {row.label ? (
                          <span className="min-w-[3.25rem] text-muted-foreground">
                            {row.label}:
                          </span>
                        ) : null}
                        <span className="text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("lv-LV")}
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
                {!item.read_at ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markRead(item.id)}
                    className="gap-2 flex-1 sm:flex-none"
                    disabled={markingId === item.id}
                  >
                    {markingId === item.id ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    ) : null}
                    Mark read
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteNotification(item.id)}
                  className="gap-2 flex-1 sm:flex-none"
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  ) : null}
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {dialog}
    </section>
  );
}
