import { LandingPage } from "@/components/marketing/LandingPage";
import { getMarketingLocale } from "@/components/marketing/content";

export default async function MarketingHomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  return <LandingPage locale={locale} />;
}
