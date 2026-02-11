import type { Metadata } from "next";
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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Production Workflow System",
  description: "Production workflow dashboard",
  manifest: "/manifest.webmanifest",
  themeColor: "#0b0f14",
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
            <WorkflowProvider>
              <HierarchyProvider>
                <OrdersProvider>
                  <BatchesProvider>
                    <AppShell>{children}</AppShell>
                    <NotificationsViewport />
                  </BatchesProvider>
                </OrdersProvider>
              </HierarchyProvider>
            </WorkflowProvider>
          </NotificationsProvider>
        </UserProvider>
      </body>
    </html>
  );
}
