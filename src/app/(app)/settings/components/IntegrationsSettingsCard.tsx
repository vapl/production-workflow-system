"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { InputField } from "@/components/ui/InputField";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TabsContent } from "@/components/ui/Tabs";
import { TextAreaField } from "@/components/ui/TextAreaField";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type SaveState = "idle" | "saving" | "saved" | "error";

type IntegrationItem = {
  id: string;
  name: string;
  status: string;
};

type IntegrationsSettingsCardProps = {
  t: TranslationFn;
  isTenantProfileLoading: boolean;
  outboundFromName: string;
  setOutboundFromName: (value: string) => void;
  outboundFromEmail: string;
  setOutboundFromEmail: (value: string) => void;
  outboundReplyToEmail: string;
  setOutboundReplyToEmail: (value: string) => void;
  outboundUseUserSender: boolean;
  setOutboundUseUserSender: (value: boolean) => void;
  outboundSenderVerified: boolean;
  setOutboundSenderVerified: (value: boolean) => void;
  companyName: string;
  canManageOutbound: boolean;
  externalRequestEmailSubjectTemplate: string;
  setExternalRequestEmailSubjectTemplate: (value: string) => void;
  externalRequestEmailHtmlTemplate: string;
  setExternalRequestEmailHtmlTemplate: (value: string) => void;
  externalRequestEmailTextTemplate: string;
  setExternalRequestEmailTextTemplate: (value: string) => void;
  defaultExternalRequestEmailSubjectTemplate: string;
  defaultExternalRequestEmailHtmlTemplate: string;
  defaultExternalRequestEmailTextTemplate: string;
  handleSaveOutboundEmail: () => Promise<void> | void;
  outboundState: SaveState;
  outboundMessage: string;
  integrations: IntegrationItem[];
};

export function IntegrationsSettingsCard(props: IntegrationsSettingsCardProps) {
  const {
    t,
    isTenantProfileLoading,
    outboundFromName,
    setOutboundFromName,
    outboundFromEmail,
    setOutboundFromEmail,
    outboundReplyToEmail,
    setOutboundReplyToEmail,
    outboundUseUserSender,
    setOutboundUseUserSender,
    outboundSenderVerified,
    setOutboundSenderVerified,
    companyName,
    canManageOutbound,
    externalRequestEmailSubjectTemplate,
    setExternalRequestEmailSubjectTemplate,
    externalRequestEmailHtmlTemplate,
    setExternalRequestEmailHtmlTemplate,
    externalRequestEmailTextTemplate,
    setExternalRequestEmailTextTemplate,
    defaultExternalRequestEmailSubjectTemplate,
    defaultExternalRequestEmailHtmlTemplate,
    defaultExternalRequestEmailTextTemplate,
    handleSaveOutboundEmail,
    outboundState,
    outboundMessage,
    integrations,
  } = props;

  return (
    <TabsContent value="integrations">
      <div className="space-y-4">
        {isTenantProfileLoading ? (
          <Card>
            <CardContent className="py-10">
              <LoadingSpinner label={t("settings.integrations.loading")} />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.integrations.outboundTitle")}</CardTitle>
            <CardDescription>
              {t("settings.integrations.outboundDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                {t("settings.integrations.fromName")}
                <Input
                  value={outboundFromName}
                  onChange={(event) => setOutboundFromName(event.target.value)}
                  className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  placeholder={
                    companyName || t("settings.integrations.companyPlaceholder")
                  }
                  disabled={!canManageOutbound}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                {t("settings.integrations.fromEmail")}
                <Input
                  type="email"
                  value={outboundFromEmail}
                  onChange={(event) => setOutboundFromEmail(event.target.value)}
                  className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  placeholder={t("settings.integrations.fromEmailPlaceholder")}
                  disabled={!canManageOutbound}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                {t("settings.integrations.replyTo")}
                <Input
                  type="email"
                  value={outboundReplyToEmail}
                  onChange={(event) =>
                    setOutboundReplyToEmail(event.target.value)
                  }
                  className="h-11 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                  placeholder={t("settings.integrations.replyToPlaceholder")}
                  disabled={!canManageOutbound}
                />
              </label>
              <div className="space-y-2 text-sm font-medium">
                {t("settings.integrations.senderMode")}
                <label className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={outboundUseUserSender}
                    onChange={(event) =>
                      setOutboundUseUserSender(event.target.checked)
                    }
                    disabled={!canManageOutbound}
                  />
                  {t("settings.integrations.useEngineerSender")}
                </label>
                <label className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={outboundSenderVerified}
                    onChange={(event) =>
                      setOutboundSenderVerified(event.target.checked)
                    }
                    disabled={!canManageOutbound}
                  />
                  {t("settings.integrations.domainVerified")}
                </label>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="text-sm font-semibold">
                {t("settings.integrations.templateTitle")}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.integrations.placeholders")}
                {
                  " {{order_number}}, {{customer_name}}, {{external_order_number}}, {{due_date}}, {{comment_block}}, {{attachments_block}}, {{comment_line}}, {{attachments_line}}, {{secure_form_link}}, {{expires_at}}, {{partner_name}}, {{sender_name}}, {{sender_email}}, {{tenant_name}}"
                }
                .
              </p>
              <InputField
                label={t("settings.integrations.subjectTemplate")}
                value={externalRequestEmailSubjectTemplate}
                onChange={(event) =>
                  setExternalRequestEmailSubjectTemplate(event.target.value)
                }
                className="h-11 text-sm"
                disabled={!canManageOutbound}
              />
              <TextAreaField
                label={t("settings.integrations.htmlTemplate")}
                value={externalRequestEmailHtmlTemplate}
                onChange={(event) =>
                  setExternalRequestEmailHtmlTemplate(event.target.value)
                }
                rows={8}
                className="text-sm"
                disabled={!canManageOutbound}
              />
              <TextAreaField
                label={t("settings.integrations.textTemplate")}
                value={externalRequestEmailTextTemplate}
                onChange={(event) =>
                  setExternalRequestEmailTextTemplate(event.target.value)
                }
                rows={8}
                className="text-sm"
                disabled={!canManageOutbound}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setExternalRequestEmailSubjectTemplate(
                      defaultExternalRequestEmailSubjectTemplate,
                    );
                    setExternalRequestEmailHtmlTemplate(
                      defaultExternalRequestEmailHtmlTemplate,
                    );
                    setExternalRequestEmailTextTemplate(
                      defaultExternalRequestEmailTextTemplate,
                    );
                  }}
                  disabled={!canManageOutbound}
                >
                  {t("settings.integrations.resetDefault")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.integrations.domainHint")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSaveOutboundEmail}
                disabled={!canManageOutbound || outboundState === "saving"}
              >
                {outboundState === "saving"
                  ? t("settings.users.saving")
                  : t("settings.integrations.saveOutbound")}
              </Button>
              {outboundMessage ? (
                <span
                  className={`text-xs ${
                    outboundState === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {outboundMessage}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.section.integrations")}</CardTitle>
            <CardDescription>
              {t("settings.integrations.comingSoonDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="font-medium">{integration.name}</div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {integration.status === "Coming soon"
                    ? t("settings.integrations.comingSoon")
                    : integration.status}
                </span>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {t("settings.integrations.expectedFlow")}
            </div>
            <Button variant="outline" className="w-full">
              {t("settings.integrations.requestIntegration")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
