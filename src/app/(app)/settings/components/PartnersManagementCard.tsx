"use client";

import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { InputField } from "@/components/ui/InputField";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SelectField } from "@/components/ui/SelectField";
import type { Partner, PartnerGroup } from "@/types/partner";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type PartnersManagementCardProps = {
  t: TranslationFn;
  isLoading: boolean;
  partnerGroups: PartnerGroup[];
  partnerGroupName: string;
  setPartnerGroupName: (value: string) => void;
  editingPartnerGroupId: string | null;
  handleSavePartnerGroup: () => Promise<void> | void;
  resetPartnerGroupForm: () => void;
  selectedPartnerGroupIds: string[];
  setSelectedPartnerGroupIds: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  handleDeleteSelectedPartnerGroups: () => Promise<void> | void;
  updatePartnerGroup: (
    groupId: string,
    patch: Partial<PartnerGroup>,
  ) => Promise<void> | void;
  handleEditPartnerGroup: (groupId: string) => void;
  handleCopyPartnerGroup: (groupId: string) => Promise<void> | void;
  confirmRemove: (message: string) => Promise<boolean>;
  removePartnerGroup: (groupId: string) => Promise<void> | void;
  partnerName: string;
  setPartnerName: (value: string) => void;
  partnerEmail: string;
  setPartnerEmail: (value: string) => void;
  partnerPhone: string;
  setPartnerPhone: (value: string) => void;
  partnerGroupId: string;
  setPartnerGroupId: (value: string) => void;
  editingPartnerId: string | null;
  handleSavePartner: () => Promise<void> | void;
  resetPartnerForm: () => void;
  selectedPartnerIds: string[];
  setSelectedPartnerIds: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  partners: Partner[];
  handleDeleteSelectedPartners: () => Promise<void> | void;
  updatePartner: (
    partnerId: string,
    patch: Partial<Partner>,
  ) => Promise<void> | void;
  handleEditPartner: (partnerId: string) => void;
  handleCopyPartner: (partnerId: string) => Promise<void> | void;
  removePartner: (partnerId: string) => Promise<void> | void;
};

export function PartnersManagementCard(props: PartnersManagementCardProps) {
  const {
    t,
    isLoading,
    partnerGroups,
    partnerGroupName,
    setPartnerGroupName,
    editingPartnerGroupId,
    handleSavePartnerGroup,
    resetPartnerGroupForm,
    selectedPartnerGroupIds,
    setSelectedPartnerGroupIds,
    handleDeleteSelectedPartnerGroups,
    updatePartnerGroup,
    handleEditPartnerGroup,
    handleCopyPartnerGroup,
    confirmRemove,
    removePartnerGroup,
    partnerName,
    setPartnerName,
    partnerEmail,
    setPartnerEmail,
    partnerPhone,
    setPartnerPhone,
    partnerGroupId,
    setPartnerGroupId,
    editingPartnerId,
    handleSavePartner,
    resetPartnerForm,
    selectedPartnerIds,
    setSelectedPartnerIds,
    partners,
    handleDeleteSelectedPartners,
    updatePartner,
    handleEditPartner,
    handleCopyPartner,
    removePartner,
  } = props;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <Card className="min-w-0">
          <CardContent className="py-10">
            <LoadingSpinner label={t("settings.partners.loading")} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.partners.title")}</CardTitle>
          <CardDescription>{t("settings.partners.description")}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <div className="border-t border-border pt-4 pb-8">
            <div className="text-sm font-medium">
              {t("settings.partners.partnerGroups")}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
              <InputField
                label={t("settings.partners.groupName")}
                value={partnerGroupName}
                onChange={(event) => setPartnerGroupName(event.target.value)}
                placeholder={t("settings.partners.groupNamePlaceholder")}
                className="h-10 text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={() => void handleSavePartnerGroup()}>
                  {editingPartnerGroupId
                    ? t("settings.partners.saveGroup")
                    : t("settings.partners.addGroup")}
                </Button>
                {editingPartnerGroupId ? (
                  <Button variant="outline" onClick={resetPartnerGroupForm}>
                    {t("settings.common.cancel")}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {selectedPartnerGroupIds.length > 0
                    ? t("settings.common.selectedCount", {
                        count: selectedPartnerGroupIds.length,
                      })
                    : " "}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      variant="box"
                      checked={
                        partnerGroups.length > 0 &&
                        selectedPartnerGroupIds.length === partnerGroups.length
                      }
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedPartnerGroupIds(
                            partnerGroups.map((group) => group.id),
                          );
                        } else {
                          setSelectedPartnerGroupIds([]);
                        }
                      }}
                      disabled={partnerGroups.length === 0}
                    />
                    {t("settings.operations.selectAll")}
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDeleteSelectedPartnerGroups()}
                    disabled={selectedPartnerGroupIds.length === 0}
                  >
                    {t("settings.common.removeSelected")}
                  </Button>
                </div>
              </div>
              {partnerGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="font-medium">{group.name}</div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={group.isActive}
                        onChange={(event) =>
                          updatePartnerGroup(group.id, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                      {t("settings.common.active")}
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditPartnerGroup(group.id)}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyPartnerGroup(group.id)}
                    >
                      <CopyIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (
                          !(await confirmRemove(
                            t("settings.partners.removeGroupConfirm", {
                              name: group.name,
                            }),
                          ))
                        ) {
                          return;
                        }
                        await removePartnerGroup(group.id);
                      }}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                    <Checkbox
                      variant="box"
                      checked={selectedPartnerGroupIds.includes(group.id)}
                      onChange={(event) => {
                        setSelectedPartnerGroupIds((prev) => {
                          if (event.target.checked) {
                            return [...prev, group.id];
                          }
                          return prev.filter((id) => id !== group.id);
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
              {partnerGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("settings.partners.noPartnerGroups")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border pt-4 grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_auto] lg:items-end">
            <InputField
              label={t("settings.partners.partnerName")}
              value={partnerName}
              onChange={(event) => setPartnerName(event.target.value)}
              placeholder={t("settings.partners.partnerNamePlaceholder")}
              className="h-10 text-sm"
            />
            <InputField
              label="Email"
              type="email"
              value={partnerEmail}
              onChange={(event) => setPartnerEmail(event.target.value)}
              placeholder="partner@company.com"
              className="h-10 text-sm"
            />
            <InputField
              label={t("profile.phone")}
              value={partnerPhone}
              onChange={(event) => setPartnerPhone(event.target.value)}
              placeholder="+371 2xxxxxxx"
              className="h-10 text-sm"
            />
            <SelectField
              label={t("settings.partners.group")}
              value={partnerGroupId || "__none__"}
              onValueChange={(value) =>
                setPartnerGroupId(value === "__none__" ? "" : value)
              }
            >
              <Select
                value={partnerGroupId || "__none__"}
                onValueChange={(value) =>
                  setPartnerGroupId(value === "__none__" ? "" : value)
                }
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("settings.partners.noGroup")}
                  </SelectItem>
                  {partnerGroups
                    .filter((group) => group.isActive)
                    .map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </SelectField>
            <div className="flex gap-2">
              <Button onClick={() => void handleSavePartner()}>
                {editingPartnerId
                  ? t("settings.partners.savePartner")
                  : t("settings.partners.addPartner")}
              </Button>
              {editingPartnerId ? (
                <Button variant="outline" onClick={resetPartnerForm}>
                  {t("settings.common.cancel")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {selectedPartnerIds.length > 0
                  ? t("settings.common.selectedCount", {
                      count: selectedPartnerIds.length,
                    })
                  : " "}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    variant="box"
                    checked={
                      partners.length > 0 &&
                      selectedPartnerIds.length === partners.length
                    }
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedPartnerIds(
                          partners.map((partner) => partner.id),
                        );
                      } else {
                        setSelectedPartnerIds([]);
                      }
                    }}
                    disabled={partners.length === 0}
                  />
                  {t("settings.operations.selectAll")}
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDeleteSelectedPartners()}
                  disabled={selectedPartnerIds.length === 0}
                >
                  {t("settings.common.removeSelected")}
                </Button>
              </div>
            </div>
            {partners.map((partner) => (
              <div
                key={partner.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <div className="font-medium">{partner.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {partner.groupId
                      ? (partnerGroups.find(
                          (group) => group.id === partner.groupId,
                        )?.name ?? t("settings.partners.group"))
                      : t("settings.partners.noGroup")}
                  </div>
                  {partner.email || partner.phone ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {partner.email ? `Email: ${partner.email}` : ""}
                      {partner.email && partner.phone ? " | " : ""}
                      {partner.phone ? `Phone: ${partner.phone}` : ""}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={partner.isActive}
                      onChange={(event) =>
                        updatePartner(partner.id, {
                          isActive: event.target.checked,
                        })
                      }
                    />
                    {t("settings.common.active")}
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditPartner(partner.id)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyPartner(partner.id)}
                  >
                    <CopyIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (
                        !(await confirmRemove(
                          t("settings.partners.removePartnerConfirm", {
                            name: partner.name,
                          }),
                        ))
                      ) {
                        return;
                      }
                      await removePartner(partner.id);
                    }}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                  <Checkbox
                    variant="box"
                    checked={selectedPartnerIds.includes(partner.id)}
                    onChange={(event) => {
                      setSelectedPartnerIds((prev) => {
                        if (event.target.checked) {
                          return [...prev, partner.id];
                        }
                        return prev.filter((id) => id !== partner.id);
                      });
                    }}
                  />
                </div>
              </div>
            ))}
            {partners.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t("settings.partners.noPartners")}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
