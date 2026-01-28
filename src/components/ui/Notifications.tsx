"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { CheckCircleIcon, InfoIcon, XCircleIcon } from "lucide-react";

type NotificationVariant = "success" | "error" | "info";

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutsRef = useRef(
    new Map<
      string,
      { timeoutId: ReturnType<typeof setTimeout>; startTime: number; remainingMs: number }
    >(),
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      notify: ({ title, description, variant = "success", durationMs = 3500 }) => {
        const id = crypto.randomUUID();
        setNotifications((prev) => [
          ...prev,
          { id, title, description, variant },
        ]);
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
    [notifications],
  );

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
    <div className="fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2">
      {notifications.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
          onMouseEnter={() => pause(item.id)}
          onMouseLeave={() => resume(item.id)}
        >
          {iconForVariant(item.variant)}
          <div className="flex-1 text-sm">
            <div className="font-medium">{item.title}</div>
            {item.description && (
              <div className="text-muted-foreground">{item.description}</div>
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
