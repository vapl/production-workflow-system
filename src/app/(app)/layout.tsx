import { OrdersProvider } from "@/app/(app)/orders/OrdersContext";
import { OrderFieldSettingsProvider } from "@/app/(app)/settings/OrderFieldSettingsContext";
import { AppShell } from "@/components/layout/AppShell";
import {
  NotificationsProvider,
  NotificationsViewport,
} from "@/components/ui/Notifications";
import { BatchesProvider } from "@/contexts/BatchesContext";
import { RbacProvider } from "@/contexts/RbacContext";
import { UserProvider } from "@/contexts/UserContext";
import { WorkingCalendarProvider } from "@/contexts/WorkingCalendarContext";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ServiceWorker />
      <UserProvider>
        <NotificationsProvider>
          <RbacProvider>
            <WorkflowProvider>
              <WorkingCalendarProvider>
                <OrderFieldSettingsProvider>
                  <OrdersProvider>
                    <BatchesProvider>
                      <AppShell>{children}</AppShell>
                      <NotificationsViewport />
                    </BatchesProvider>
                  </OrdersProvider>
                </OrderFieldSettingsProvider>
              </WorkingCalendarProvider>
            </WorkflowProvider>
          </RbacProvider>
        </NotificationsProvider>
      </UserProvider>
    </>
  );
}
