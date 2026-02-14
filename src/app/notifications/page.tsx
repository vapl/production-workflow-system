"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCurrentUser } from "@/contexts/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [deletingAllRead, setDeletingAllRead] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const query = supabase
        .from("notifications")
        .select("id, title, body, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (showUnreadOnly) {
        query.is("read_at", null);
      }
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
  }, [user.isAuthenticated, showUnreadOnly]);

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
      supabase.removeChannel(channel);
    };
  }, [user.tenantId]);

  const markAllRead = async () => {
    if (!supabase) {
      return;
    }
    const ids = items.filter((item) => !item.read_at).map((item) => item.id);
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
    const readIds = items.filter((item) => item.read_at).map((item) => item.id);
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

  return (
    <section className="space-y-0 md:space-y-4 pt-16 md:pt-0">
      <div className="pointer-events-none fixed right-4 top-3 z-40 md:hidden">
        <div className="pointer-events-auto inline-flex rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
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
        className="md:sticky md:top-16 md:bg-background/95 z-20 md:backdrop-blur"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showUnreadOnly}
                  onChange={(event) => setShowUnreadOnly(event.target.checked)}
                />
                Unread only
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={markAllRead}
                className="gap-2"
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
                className="gap-2"
                disabled={deletingAllRead}
              >
                {deletingAllRead ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                ) : null}
                Delete all read
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Loading notifications...
            </div>
          ) : null}
          {!isLoading && items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              No notifications found.
            </div>
          ) : null}
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border border-border px-3 py-2 text-xs ${
                item.read_at ? "text-muted-foreground" : "bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-foreground">
                    {item.title}
                  </div>
                  {item.body ? <div className="mt-1">{item.body}</div> : null}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!item.read_at ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markRead(item.id)}
                      className="gap-2"
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
                    className="gap-2"
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
        </CardContent>
        {dialog}
      </Card>
    </section>
  );
}
