import { Suspense } from "react";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Suspense fallback={<div className="h-16 border-b border-slate-200 bg-white" />}>
        <MarketingHeader />
      </Suspense>
      {children}
      <Suspense fallback={<div className="h-24 border-t border-slate-200 bg-white" />}>
        <MarketingFooter />
      </Suspense>
    </div>
  );
}
