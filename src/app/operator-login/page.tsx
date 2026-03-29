"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, LogInIcon, XIcon } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import { cn } from "@/components/ui/utils";
import { buildOperatorAuthPassword } from "@/lib/domain/operatorPinAuth";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabaseClient";

const PIN_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function OperatorLoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loginCode, setLoginCode] = useState("");
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/production/operator");
      }
    });
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setError(t("production.main.errors.supabaseNotConfigured"));
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const resolveResponse = await fetch(
        "/api/production/operators/pin-login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ loginCode }),
        },
      );

      const resolveResult = (await resolveResponse
        .json()
        .catch(() => ({}))) as {
        email?: string;
        error?: string;
      };

      if (!resolveResponse.ok || !resolveResult.email) {
        throw new Error(
          resolveResult.error ||
            t("production.main.operators.pinLoginResolveFailed"),
        );
      }

      const signInResult = await supabase.auth.signInWithPassword({
        email: resolveResult.email,
        password: buildOperatorAuthPassword(pin),
      });

      if (signInResult.error) {
        throw signInResult.error;
      }

      router.replace("/production/operator");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("production.main.operators.pinLoginFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const appendPinDigit = (digit: string) => {
    setPin((current) => (current.length >= 4 ? current : `${current}${digit}`));
  };

  const handlePinBackspace = () => {
    setPin((current) => current.slice(0, -1));
  };

  const handlePinClear = () => {
    setPin("");
  };

  return (
    <AuthShell currentView="operator">
      <form
        className="grid h-full w-full max-w-md grid-rows-[auto_auto_1fr_auto] gap-4 pb-1 md:block md:h-auto md:space-y-3 md:pb-0"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1 pt-1 text-center md:space-y-2 md:pt-0">
          <h2 className="text-[clamp(2.05rem,5.1dvh,2.8rem)] font-semibold leading-[0.9] tracking-tight text-slate-950 md:text-[clamp(2.35rem,3vw,3.15rem)]">
            {t("production.main.operators.pinLoginTitle")}
          </h2>
          <p className="mx-auto max-w-sm text-[clamp(0.9rem,2dvh,1rem)] leading-snug text-slate-600 md:text-base">
            {t("production.main.operators.pinLoginSubtitle")}
          </p>
        </div>

        <div className="space-y-3 md:space-y-2.5">
          <InputField
            label={t("production.main.operators.manageCode")}
            value={loginCode}
            onChange={(event) => setLoginCode(event.target.value.toUpperCase())}
            placeholder={t("production.main.operators.manageCodePlaceholder")}
            wrapperClassName="h-[clamp(2.85rem,6dvh,3rem)] md:h-11"
            className="text-center text-lg font-semibold tracking-[0.18em] md:text-lg"
          />

          <div className="space-y-2 md:space-y-2">
            <div className="text-center text-xs font-medium uppercase tracking-[0.22em] text-slate-500 md:text-xs">
              {t("production.main.operators.managePin")}
            </div>
            <div className="grid grid-cols-4 h-10 gap-2.5 md:gap-3">
              {Array.from({ length: 4 }).map((_, index) => {
                const filled = index < pin.length;
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex h-[clamp(2.85rem,6dvh,3rem)] items-center justify-center rounded-2xl border text-3xl font-semibold shadow-sm transition-colors md:h-12 md:text-[1.8rem]",
                      filled
                        ? "border-primary/30 bg-primary/8 text-primary"
                        : "border-slate-200 bg-white text-slate-300",
                    )}
                  >
                    {filled ? (
                      <span className="h-3 w-3 rounded-full bg-current" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-3 auto-rows-fr gap-2.5 md:gap-4">
          {PIN_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              className="flex h-full items-center py-4 justify-center rounded-full bg-white text-[clamp(2.0rem,4.0dvh,2.5rem)] font-medium text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:shadow-[0_20px_48px_rgba(15,23,42,0.12)] disabled:cursor-not-allowed disabled:opacity-50 md:h-[4rem] md:text-[2.3rem]"
              onClick={() => appendPinDigit(digit)}
              disabled={isSubmitting || pin.length >= 4}
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            className="flex h-full min-h-[4.25rem] items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:shadow-[0_20px_48px_rgba(15,23,42,0.12)] disabled:cursor-not-allowed disabled:opacity-50 md:h-[4rem]"
            onClick={handlePinClear}
            disabled={isSubmitting || pin.length === 0}
            aria-label={t("production.main.common.clear")}
          >
            <XIcon className="h-7 w-7 md:h-7 md:w-7" />
          </button>

          <button
            type="button"
            className="flex h-full min-h-[4.25rem] items-center justify-center rounded-full bg-white text-[clamp(1.9rem,4.4dvh,2.5rem)] font-medium text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:shadow-[0_20px_48px_rgba(15,23,42,0.12)] disabled:cursor-not-allowed disabled:opacity-50 md:h-[4rem] md:text-[2.3rem]"
            onClick={() => appendPinDigit("0")}
            disabled={isSubmitting || pin.length >= 4}
          >
            0
          </button>

          <button
            type="button"
            className="flex h-full min-h-[4.25rem] items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:shadow-[0_20px_48px_rgba(15,23,42,0.12)] disabled:cursor-not-allowed disabled:opacity-50 md:h-[4rem]"
            onClick={handlePinBackspace}
            disabled={isSubmitting || pin.length === 0}
            aria-label={t("production.main.common.backspace")}
          >
            <ArrowLeftIcon className="h-7 w-7 md:h-7 md:w-7" />
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="mt-8 h-[clamp(2.9rem,6.1dvh,3.2rem)] w-full rounded-2xl text-base md:h-11 md:text-base"
          disabled={isSubmitting || !loginCode.trim() || pin.length !== 4}
        >
          <LogInIcon className="h-5 w-5" />
          {isSubmitting
            ? t("production.main.common.loading")
            : t("production.main.operators.pinLoginSubmit")}
        </Button>
      </form>
    </AuthShell>
  );
}
