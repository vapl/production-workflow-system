import type { AppLocale } from "@/lib/i18n/locales";
import en from "@/lib/i18n/messages/en";
import lv from "@/lib/i18n/messages/lv";
import ru from "@/lib/i18n/messages/ru";

export const messages = {
  lv,
  en,
  ru,
} as const;

export type MessageDictionary = (typeof messages)[AppLocale];
