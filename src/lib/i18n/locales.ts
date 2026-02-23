export const appLocales = ["lv", "en", "ru"] as const;

export type AppLocale = (typeof appLocales)[number];

export const defaultAppLocale: AppLocale = "lv";

const intlLocaleMap: Record<AppLocale, string> = {
  lv: "lv-LV",
  en: "en-US",
  ru: "ru-RU",
};

export function normalizeAppLocale(value?: string | null): AppLocale {
  if (!value) {
    return defaultAppLocale;
  }
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const base = normalized.split("-")[0];
  if (appLocales.includes(base as AppLocale)) {
    return base as AppLocale;
  }
  return defaultAppLocale;
}

export function toIntlLocale(locale: AppLocale): string {
  return intlLocaleMap[locale] ?? intlLocaleMap[defaultAppLocale];
}

export function toHtmlLang(locale: AppLocale): string {
  return locale;
}
