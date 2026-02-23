"use client";

import { useCurrentUser } from "@/contexts/UserContext";
import {
  defaultAppLocale,
  normalizeAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";
import { messages } from "@/lib/i18n/messages";

type Vars = Record<string, string | number>;

function getByPath(source: unknown, path: string): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    if (!(key in vars)) {
      return `{${key}}`;
    }
    return String(vars[key]);
  });
}

export function useI18n() {
  const user = useCurrentUser();
  const locale: AppLocale = normalizeAppLocale(user.locale ?? defaultAppLocale);
  const current = messages[locale];
  const fallback = messages[defaultAppLocale];

  const t = (key: string, vars?: Vars) => {
    const direct = getByPath(current, key);
    if (direct !== null) {
      return interpolate(direct, vars);
    }
    const fromFallback = getByPath(fallback, key);
    if (fromFallback !== null) {
      return interpolate(fromFallback, vars);
    }
    return key;
  };

  return { t, locale };
}
