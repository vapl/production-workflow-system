export const marketingLocales = ["lv", "en", "ru"] as const;

export type MarketingLocale = (typeof marketingLocales)[number];

export function getMarketingLocale(value?: string): MarketingLocale {
  if (!value) return "lv";
  const normalized = value.toLowerCase();
  return marketingLocales.includes(normalized as MarketingLocale)
    ? (normalized as MarketingLocale)
    : "lv";
}

type MarketingCopy = {
  nav: { home: string; features: string; pricing: string; about: string; contact: string; login: string };
  home: {
    badge: string; title: string; subtitle: string; ctaPrimary: string; ctaSecondary: string;
    boardTitle: string; updated: string; statuses: string[];
    visibilityTitle: string; visibilityPoints: string[];
    workflowTitle: string; workflow: { number: string; title: string; text: string }[];
    finalTitle: string; finalText: string;
  };
};

export const marketingCopy: Record<MarketingLocale, MarketingCopy> = {
  lv: {
    nav: { home: "Sākums", features: "Iespējas", pricing: "Cenas", about: "Par mums", contact: "Kontakti", login: "Login" },
    home: {
      badge: "Ražošanas komandām", title: "Ienes skaidrību ražošanas procesā",
      subtitle: "PWS palīdz vienuviet vadīt pasūtījumus, partijas un izpildi, lai komanda strādātu ātrāk un paredzamāk.",
      ctaPrimary: "Rezervēt demo", ctaSecondary: "Skatīt iespējas", boardTitle: "Live Production Board", updated: "Atjaunots pirms 2 min",
      statuses: ["Plānā", "Risks", "Procesā"],
      visibilityTitle: "Production Visibility Shouldn't Be This Hard",
      visibilityPoints: [
        "Centralizēta plūsma no order līdz piegādei",
        "Reāllaika statuss katrai partijai un darba centram",
        "Savienojas ar ERP/Excel bez pilnas sistēmas nomaiņas",
        "Automātiski brīdinājumi par aizkavēm un bottleneck riskiem",
      ],
      workflowTitle: "A Workflow System Built for Real Production",
      workflow: [
        { number: "01", title: "Izveido pasūtījumu", text: "Importē datus un automātiski sagatavo darba plūsmu komandai." },
        { number: "02", title: "Ģenerē partijas", text: "Sistēma sadala darbus pēc termiņiem, prioritātes un kapacitātes." },
        { number: "03", title: "Uzraugi izpildi", text: "QR skenēšana un reāllaika progresa skats vadībai un operatoriem." },
      ],
      finalTitle: "Pilna marketing lapa ar vairākām sadaļām", finalText: "Atsevišķas lapas uzlabo skaidrību, SEO un B2B pirkšanas procesu.",
    },
  },
  en: {
    nav: { home: "Home", features: "Features", pricing: "Pricing", about: "About", contact: "Contact", login: "Login" },
    home: {
      badge: "For manufacturing teams", title: "Bring clarity to your production floor",
      subtitle: "PWS unifies orders, batches, and execution so teams can move faster with predictable outcomes.",
      ctaPrimary: "Book demo", ctaSecondary: "View features", boardTitle: "Live Production Board", updated: "Updated 2 min ago",
      statuses: ["On Track", "At Risk", "In Progress"], visibilityTitle: "Production visibility shouldn't be this hard",
      visibilityPoints: [
        "Centralized flow from order intake to shipment",
        "Real-time status by batch, station, and operator",
        "Works with ERP/Excel without full replacement",
        "Automatic delay and bottleneck alerts",
      ],
      workflowTitle: "A workflow system built for real production",
      workflow: [
        { number: "01", title: "Create order", text: "Import data and generate a standardized workflow instantly." },
        { number: "02", title: "Generate batches", text: "Group work by deadline, priority, and available capacity." },
        { number: "03", title: "Track execution", text: "QR scanning plus real-time progress for managers and operators." },
      ],
      finalTitle: "Built as a complete multi-page marketing site", finalText: "Dedicated pages improve clarity, SEO, and buyer confidence.",
    },
  },
  ru: {
    nav: { home: "Главная", features: "Возможности", pricing: "Цены", about: "О нас", contact: "Контакты", login: "Вход" },
    home: {
      badge: "Для производственных команд", title: "Добавьте ясность в производственный процесс",
      subtitle: "PWS объединяет заказы, партии и исполнение в одной системе для более быстрой и предсказуемой работы.",
      ctaPrimary: "Запросить демо", ctaSecondary: "Смотреть возможности", boardTitle: "Live Production Board", updated: "Обновлено 2 мин назад",
      statuses: ["По плану", "Риск", "В процессе"], visibilityTitle: "Production Visibility Shouldn't Be This Hard",
      visibilityPoints: [
        "Единый поток от заказа до отгрузки",
        "Статус в реальном времени по партиям и участкам",
        "Интеграция с ERP/Excel без полной замены системы",
        "Автоматические предупреждения о задержках и узких местах",
      ],
      workflowTitle: "Система workflow для реального производства",
      workflow: [
        { number: "01", title: "Создайте заказ", text: "Импортируйте данные и сразу сформируйте рабочий процесс." },
        { number: "02", title: "Сформируйте партии", text: "Система группирует работу по срокам, приоритетам и мощности." },
        { number: "03", title: "Отслеживайте выполнение", text: "QR-сканирование и прогресс в реальном времени." },
      ],
      finalTitle: "Полноценный multi-page маркетинг сайт", finalText: "Отдельные страницы повышают понятность, SEO и конверсию.",
    },
  },
};
