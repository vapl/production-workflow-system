import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OrdersProvider } from "@/app/orders/OrdersContext";
import { HierarchyProvider } from "@/app/settings/HierarchyContext";
import { UserProvider } from "@/contexts/UserContext";
import { BatchesProvider } from "@/contexts/BatchesContext";
import {
  NotificationsProvider,
  NotificationsViewport,
} from "@/components/ui/Notifications";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";
import { RbacProvider } from "@/contexts/RbacContext";
import { WorkingCalendarProvider } from "@/contexts/WorkingCalendarContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Flip to `false` if mobile pinch-zoom should be enabled again.
const DISABLE_MOBILE_ZOOM = true;

export const metadata: Metadata = {
  title: "Production Workflow System",
  description: "Production workflow dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/pwa/icon-maskable.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" }],
  },
  appleWebApp: {
    title: "Production Workflow System",
    statusBarStyle: "black-translucent",
    capable: true,
  },
};

const appViewport: Viewport = DISABLE_MOBILE_ZOOM
  ? {
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      viewportFit: "cover",
      themeColor: "#0b0f14",
    }
  : {
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
      themeColor: "#0b0f14",
    };

export const viewport: Viewport = appViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorker />
        <UserProvider>
          <NotificationsProvider>
            <RbacProvider>
              <WorkflowProvider>
                <WorkingCalendarProvider>
                  <HierarchyProvider>
                    <OrdersProvider>
                      <BatchesProvider>
                        <AppShell>{children}</AppShell>
                        <NotificationsViewport />
                      </BatchesProvider>
                    </OrdersProvider>
                  </HierarchyProvider>
                </WorkingCalendarProvider>
              </WorkflowProvider>
            </RbacProvider>
          </NotificationsProvider>
        </UserProvider>
      </body>
    </html>
  );
}
