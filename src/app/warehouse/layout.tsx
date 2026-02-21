"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const sections = [
  { key: "queue", label: "Queue", href: "/warehouse/queue" },
  { key: "external", label: "External", href: "/warehouse/external" },
  { key: "receive", label: "Receive", href: "/warehouse/receive" },
] as const;

function getActiveIndex(pathname: string) {
  if (pathname.startsWith("/warehouse/receive")) return 2;
  if (pathname.startsWith("/warehouse/external")) return 1;
  return 0;
}

export default function WarehouseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeIndex = useMemo(() => getActiveIndex(pathname), [pathname]);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const goToIndex = (index: number) => {
    const target = sections[index];
    if (!target) return;
    if (pathname !== target.href) {
      router.push(target.href);
    }
  };

  return (
    <div className="space-y-2">
      <div className="sticky top-[calc(env(safe-area-inset-top)+0.6rem)] z-30 -mx-4 flex justify-center px-4 py-1 md:static md:mx-0 md:px-0">
        <div
          className="inline-flex rounded-full border border-border bg-muted/40 p-1 shadow-sm"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            startX.current = touch.clientX;
            startY.current = touch.clientY;
          }}
          onTouchEnd={(event) => {
            const initialX = startX.current;
            const initialY = startY.current;
            startX.current = null;
            startY.current = null;
            if (initialX == null || initialY == null) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const deltaX = touch.clientX - initialX;
            const deltaY = Math.abs(touch.clientY - initialY);
            if (Math.abs(deltaX) < 48 || deltaY > 52) return;
            if (deltaX < 0 && activeIndex < sections.length - 1) {
              goToIndex(activeIndex + 1);
              return;
            }
            if (deltaX > 0 && activeIndex > 0) {
              goToIndex(activeIndex - 1);
            }
          }}
        >
          {sections.map((section, index) => {
            const active = index === activeIndex;
            return (
              <Link key={section.key} href={section.href}>
                <span
                  className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {section.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
