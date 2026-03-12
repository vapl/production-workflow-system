"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type OptionLike = {
  value: string;
  label: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type OperationsQrSettingsCardProps = {
  t: TranslationFn;
  optionLabel: (group: string, value: string, fallback: string) => string;
  qrLabelSizeOptions: OptionLike[];
  qrEnabledSizes: string[];
  setQrEnabledSizes: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  qrDefaultSize: string;
  setQrDefaultSize: (value: string) => void;
  qrContentFieldOptions: OptionLike[];
  qrContentFields: string[];
  setQrContentFields: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  getQrContentFieldLabel: (option: OptionLike) => string;
  handleSaveQrSettings: () => Promise<void> | void;
  qrSettingsState: SaveState;
  qrSettingsMessage: string;
};

export function OperationsQrSettingsCard(
  props: OperationsQrSettingsCardProps,
) {
  const {
    t,
    optionLabel,
    qrLabelSizeOptions,
    qrEnabledSizes,
    setQrEnabledSizes,
    qrDefaultSize,
    setQrDefaultSize,
    qrContentFieldOptions,
    qrContentFields,
    setQrContentFields,
    getQrContentFieldLabel,
    handleSaveQrSettings,
    qrSettingsState,
    qrSettingsMessage,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.operations.qrLabelTitle")}</CardTitle>
        <CardDescription>
          {t("settings.operations.qrLabelDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {t("settings.operations.labelSizes")}
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {qrLabelSizeOptions.map((option) => {
                const checked = qrEnabledSizes.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <Checkbox
                      checked={checked}
                      onChange={(event) => {
                        setQrEnabledSizes((prev) => {
                          if (event.target.checked) {
                            return [...prev, option.value];
                          }
                          return prev.filter((value) => value !== option.value);
                        });
                      }}
                    />
                    {optionLabel("qrSize", option.value, option.label)}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {t("settings.operations.defaultSize")}
            </div>
            <Select value={qrDefaultSize} onValueChange={setQrDefaultSize}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qrLabelSizeOptions
                  .filter((option) => qrEnabledSizes.includes(option.value))
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {optionLabel(
                        "qrContentField",
                        option.value,
                        option.label,
                      )}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {t("settings.operations.defaultPrintHint")}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">
            {t("settings.operations.contentFields")}
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {qrContentFieldOptions.map((option) => {
              const checked = qrContentFields.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Checkbox
                    checked={checked}
                    onChange={(event) => {
                      setQrContentFields((prev) => {
                        if (event.target.checked) {
                          return [...prev, option.value];
                        }
                        return prev.filter((value) => value !== option.value);
                      });
                    }}
                  />
                  {getQrContentFieldLabel(option)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => void handleSaveQrSettings()}
            disabled={qrSettingsState === "saving"}
          >
            {qrSettingsState === "saving"
              ? t("settings.users.saving")
              : t("settings.operations.saveQrSettings")}
          </Button>
          {qrSettingsState !== "idle" && qrSettingsMessage ? (
            <span
              className={`text-xs ${
                qrSettingsState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {qrSettingsMessage}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
