"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircleIcon, InfoIcon, XCircleIcon } from "lucide-react";
import { createId } from "@/lib/utils/createId";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/contexts/UserContext";

type NotificationVariant = "success" | "error" | "info";

function variantFromNotificationType(type?: string | null): NotificationVariant {
  if (type === "blocked") {
    return "error";
  }
  if (type === "resumed" || type === "done") {
    return "success";
  }
  return "info";
}

function formatNotificationBody(body?: string) {
  if (!body) return undefined;
  if (body.includes("\n")) return body;
  const legacy = body.match(/^(.*?) at (.*?)\. (.*?)(?: \(by (.*?)\))?\.$/);
  if (!legacy) return body;
  const [, item, station, actionOrReason, actor] = legacy;
  const actorLine = actor ? `\nBy: ${actor}` : "";
  return `Item: ${item}\nStation: ${station}\nAction: ${actionOrReason}${actorLine}`;
}

interface Notification {
  id: string;
  title: string;
  description?: string;
  variant: NotificationVariant;
}

interface NotificationsContextValue {
  notifications: Notification[];
  notify: (input: {
    title: string;
    description?: string;
    variant?: NotificationVariant;
    durationMs?: number;
  }) => void;
  dismiss: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

function iconForVariant(variant: NotificationVariant) {
  switch (variant) {
    case "success":
      return <CheckCircleIcon className="h-4 w-4 text-emerald-500" />;
    case "error":
      return <XCircleIcon className="h-4 w-4 text-destructive" />;
    default:
      return <InfoIcon className="h-4 w-4 text-blue-500" />;
  }
}

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutsRef = useRef(
    new Map<
      string,
      { timeoutId: ReturnType<typeof setTimeout>; startTime: number; remainingMs: number }
    >(),
  );
  const notify = useCallback(
    ({
      title,
      description,
      variant = "success",
      durationMs = 3500,
    }: {
      title: string;
      description?: string;
      variant?: NotificationVariant;
      durationMs?: number;
    }) => {
      const id = createId("notification");
      setNotifications((prev) => [...prev, { id, title, description, variant }]);
      if (durationMs > 0) {
        const startTime = Date.now();
        const timeoutId = setTimeout(() => {
          setNotifications((prev) => prev.filter((item) => item.id !== id));
          timeoutsRef.current.delete(id);
        }, durationMs);
        timeoutsRef.current.set(id, {
          timeoutId,
          startTime,
          remainingMs: durationMs,
        });
      }
    },
    [],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      notify,
      dismiss: (id) => {
        const timer = timeoutsRef.current.get(id);
        if (timer) {
          clearTimeout(timer.timeoutId);
          timeoutsRef.current.delete(id);
        }
        setNotifications((prev) => prev.filter((item) => item.id !== id));
      },
      pause: (id) => {
        const timer = timeoutsRef.current.get(id);
        if (!timer) {
          return;
        }
        clearTimeout(timer.timeoutId);
        const elapsed = Date.now() - timer.startTime;
        const remainingMs = Math.max(timer.remainingMs - elapsed, 0);
        timeoutsRef.current.set(id, {
          timeoutId: timer.timeoutId,
          startTime: timer.startTime,
          remainingMs,
        });
      },
      resume: (id) => {
        const timer = timeoutsRef.current.get(id);
        if (!timer) {
          return;
        }
        if (timer.remainingMs <= 0) {
          setNotifications((prev) => prev.filter((item) => item.id !== id));
          timeoutsRef.current.delete(id);
          return;
        }
        const startTime = Date.now();
        const timeoutId = setTimeout(() => {
          setNotifications((prev) => prev.filter((item) => item.id !== id));
          timeoutsRef.current.delete(id);
        }, timer.remainingMs);
        timeoutsRef.current.set(id, {
          timeoutId,
          startTime,
          remainingMs: timer.remainingMs,
        });
      },
    }),
    [notifications, notify],
  );

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user.isAuthenticated || !user.tenantId) {
      return;
    }
    const channel = sb
      .channel(`notifications-toast:${user.tenantId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          const next = payload.new as {
            user_id?: string | null;
            type?: string | null;
            title?: string;
            body?: string | null;
          };
          if (next.user_id && next.user_id !== user.id) {
            return;
          }
          notify({
            title: next.title ?? "Notification",
            description: formatNotificationBody(next.body ?? undefined),
            variant: variantFromNotificationType(next.type),
          });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [notify, user.id, user.isAuthenticated, user.tenantId]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
}

export function NotificationsViewport() {
  const { notifications, dismiss, pause, resume } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex w-[calc(100vw-1rem)] max-w-sm -translate-x-1/2 flex-col gap-2 md:left-auto md:top-auto md:w-full md:translate-x-0 md:bottom-6 md:right-6">
      {notifications.map((item) => (
        <div
          key={item.id}
          className="animate-notification-in-mobile flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg md:animate-none"
          onMouseEnter={() => pause(item.id)}
          onMouseLeave={() => resume(item.id)}
        >
          {iconForVariant(item.variant)}
          <div className="flex-1 text-sm">
            <div className="font-medium">{item.title}</div>
            {item.description && (
              <div className="whitespace-pre-line text-muted-foreground">
                {item.description}
              </div>
            )}
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => dismiss(item.id)}
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
}
