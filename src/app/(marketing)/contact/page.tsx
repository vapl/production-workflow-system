import Link from "next/link";
import { getMarketingLocale, type MarketingLocale } from "@/components/marketing/content";

type ContactCopy = {
  title: string;
  subtitle: string;
  emailLabel: string;
  phoneLabel: string;
  emailCta: string;
  faq: string;
  faqs: string[];
};

const copy: Record<MarketingLocale, ContactCopy> = {
  lv: {
    title: "Kontakti un FAQ",
    subtitle: "Sazinies ar mums demo vai piedāvājuma saņemšanai.",
    emailLabel: "E-pasts",
    phoneLabel: "Tālrunis",
    emailCta: "Rakstīt e-pastu",
    faq: "Biežāk uzdotie jautājumi",
    faqs: [
      "Vai PWS var ieviest bez ERP nomaiņas?",
      "Cik ilgi ilgst ieviešana?",
      "Vai nodrošināt operatoru apmācības?",
    ],
  },
  en: {
    title: "Contact and FAQ",
    subtitle: "Reach out for a demo or detailed proposal.",
    emailLabel: "Email",
    phoneLabel: "Phone",
    emailCta: "Send email",
    faq: "Frequently Asked Questions",
    faqs: [
      "Can PWS be implemented without replacing ERP?",
      "How long does onboarding take?",
      "Do you provide operator training?",
    ],
  },
  ru: {
    title: "Контакты и FAQ",
    subtitle: "Свяжитесь с нами для демо и коммерческого предложения.",
    emailLabel: "Email",
    phoneLabel: "Телефон",
    emailCta: "Написать email",
    faq: "Часто задаваемые вопросы",
    faqs: [
      "Можно внедрить PWS без замены ERP?",
      "Сколько длится внедрение?",
      "Проводите ли обучение операторов?",
    ],
  },
};

export default async function MarketingContactPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const t = copy[locale];

  return (
    <main className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-16">
      <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-3xl text-slate-600">{t.subtitle}</p>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-7">
        <p className="text-slate-700">{t.emailLabel}: hello@domain.eu</p>
        <p className="mt-2 text-slate-700">{t.phoneLabel}: +371 20 000 000</p>
        <Link
          href="mailto:hello@domain.eu"
          className="mt-5 inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
        >
          {t.emailCta}
        </Link>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-slate-900">{t.faq}</h2>
        <div className="mt-5 space-y-3">
          {t.faqs.map((item) => (
            <article key={item} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-medium text-slate-900">{item}</h3>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
