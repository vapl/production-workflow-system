"use client";

import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
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
import { Tooltip } from "@/components/ui/Tooltip";
import type { PermissionKey } from "@/lib/auth/permissions";
import type { UserRole } from "@/contexts/UserContext";

type TranslationFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type UserRow = {
  id: string;
  name: string;
  role: UserRole;
  isAdmin: boolean;
  isOwner: boolean;
};

type InviteRow = {
  id: string;
  email: string;
  fullName?: string | null;
  role: UserRole;
  invitedAt: string;
  acceptedAt?: string | null;
};

type PermissionDefinitionLike = {
  key: PermissionKey;
  label: string;
  description: string;
};

type UsersSettingsCardProps = {
  t: TranslationFn;
  isUsersLoading: boolean;
  isInvitesLoading: boolean;
  rolePermissionsLoading: boolean;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteFullName: string;
  setInviteFullName: (value: string) => void;
  inviteRole: UserRole;
  setInviteRole: (value: UserRole) => void;
  assignableRoleOptions: UserRole[];
  formatUserRoleLabel: (role: UserRole | string) => string;
  canManageRolePermissions: boolean;
  handleInviteUser: () => Promise<void> | void;
  inviteState: "idle" | "sending" | "sent" | "error";
  inviteMessage: string;
  devRoleOverride: boolean;
  setDevRoleOverride: (value: boolean) => void;
  usersError: string | null;
  usersAccessColumns: DataTableColumn<UserRow>[];
  users: UserRow[];
  handleUpdateUserRole: (userId: string, role: UserRole) => Promise<void> | void;
  currentUserId: string;
  handleUpdateUserOwner: (
    userId: string,
    isOwner: boolean,
  ) => Promise<void> | void;
  handleUpdateUserAdmin: (
    userId: string,
    isAdmin: boolean,
  ) => Promise<void> | void;
  updatingUserId: string | null;
  deactivatingUserId: string | null;
  removingUserId: string | null;
  handleDeactivateUser: (userId: string) => Promise<void> | void;
  handleRemoveUserFromWorkspace: (
    userId: string,
  ) => Promise<void> | void;
  invites: InviteRow[];
  handleResendInvite: (email: string) => Promise<void> | void;
  resendingInviteEmail: string | null;
  handleCancelInvite: (inviteId: string) => Promise<void> | void;
  inviteListState: "idle" | "sent" | "error";
  inviteListMessage: string;
  handleSaveRolePermissions: () => Promise<void> | void;
  permissionState: "idle" | "saving" | "saved" | "error";
  hasPermissionChanges: boolean;
  rolePermissionsError: string | null;
  permissionMessage: string;
  editablePermissionRoles: UserRole[];
  permissionDefinitions: PermissionDefinitionLike[];
  permissionDrafts: Partial<Record<PermissionKey, UserRole[]>>;
  defaultPermissionRoles: Record<PermissionKey, UserRole[]>;
  togglePermissionRole: (permission: PermissionKey, role: UserRole) => void;
  showDevRoleOverride: boolean;
};

export function UsersSettingsCard(props: UsersSettingsCardProps) {
  const {
    t,
    isUsersLoading,
    isInvitesLoading,
    rolePermissionsLoading,
    inviteEmail,
    setInviteEmail,
    inviteFullName,
    setInviteFullName,
    inviteRole,
    setInviteRole,
    assignableRoleOptions,
    formatUserRoleLabel,
    canManageRolePermissions,
    handleInviteUser,
    inviteState,
    inviteMessage,
    devRoleOverride,
    setDevRoleOverride,
    usersError,
    usersAccessColumns,
    users,
    handleUpdateUserRole,
    currentUserId,
    handleUpdateUserOwner,
    handleUpdateUserAdmin,
    updatingUserId,
    deactivatingUserId,
    removingUserId,
    handleDeactivateUser,
    handleRemoveUserFromWorkspace,
    invites,
    handleResendInvite,
    resendingInviteEmail,
    handleCancelInvite,
    inviteListState,
    inviteListMessage,
    handleSaveRolePermissions,
    permissionState,
    hasPermissionChanges,
    rolePermissionsError,
    permissionMessage,
    editablePermissionRoles,
    permissionDefinitions,
    permissionDrafts,
    defaultPermissionRoles,
    togglePermissionRole,
    showDevRoleOverride,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.users.title")}</CardTitle>
        <CardDescription>{t("settings.users.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isUsersLoading || isInvitesLoading || rolePermissionsLoading ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <LoadingSpinner label={t("settings.users.loading")} />
          </div>
        ) : null}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="text-sm font-medium">{t("settings.users.inviteUser")}</div>
          <div className="mt-3 grid gap-3 items-center md:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(140px,0.5fr)_auto] md:items-end">
            <InputField
              label={t("settings.users.email")}
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={t("settings.users.emailPlaceholder")}
              className="h-10 w-full text-sm"
              disabled={!canManageRolePermissions}
            />
            <InputField
              label={t("settings.users.fullName")}
              value={inviteFullName}
              onChange={(event) => setInviteFullName(event.target.value)}
              placeholder={t("settings.users.fullNamePlaceholder")}
              className="h-10 w-full text-sm"
              disabled={!canManageRolePermissions}
            />
            <SelectField
              label={t("settings.users.role")}
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as UserRole)}
            >
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as UserRole)}
                disabled={!canManageRolePermissions}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoleOptions.map((roleOption) => (
                    <SelectItem key={roleOption} value={roleOption}>
                      {formatUserRoleLabel(roleOption)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SelectField>
            <Button
              onClick={() => void handleInviteUser()}
              disabled={!canManageRolePermissions || inviteState === "sending"}
            >
              {inviteState === "sending"
                ? t("settings.users.sending")
                : t("settings.users.sendInvite")}
            </Button>
          </div>
          {inviteMessage ? (
            <p
              className={`mt-2 text-xs ${
                inviteState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {inviteMessage}
            </p>
          ) : null}
        </div>
        {!canManageRolePermissions ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("settings.users.adminOwnerOnly")}
          </div>
        ) : null}
        {showDevRoleOverride && !canManageRolePermissions ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={devRoleOverride}
              onChange={(event) => setDevRoleOverride(event.target.checked)}
            />
            {t("settings.users.devOverride")}
          </label>
        ) : null}
        {usersError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {usersError}
          </div>
        ) : null}
        <DataTable
          columns={usersAccessColumns}
          rows={isUsersLoading ? [] : users}
          getRowId={(user) => user.id}
          wrapperClassName="overflow-x-auto overflow-y-hidden rounded-lg border border-border"
          tableClassName="w-full [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-xs [&_td]:text-sm [&_th]:whitespace-normal [&_th]:wrap-break-word [&_td]:whitespace-normal md:[&_th]:px-4 md:[&_td]:px-4"
          emptyState={
            isUsersLoading ? (
              <LoadingSpinner
                className="justify-center"
                label={t("settings.users.loadingUsers")}
              />
            ) : (
              t("settings.users.noUsers")
            )
          }
          renderCell={(user, column) => {
            if (column.id === "name") {
              return <span className="font-medium">{user.name}</span>;
            }
            if (column.id === "role") {
              return (
                <Select
                  value={user.role}
                  onValueChange={(value) =>
                    void handleUpdateUserRole(user.id, value as UserRole)
                  }
                  disabled={
                    !canManageRolePermissions &&
                    !(devRoleOverride && user.id === currentUserId)
                  }
                >
                  <SelectTrigger className="h-9 w-40 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ...assignableRoleOptions,
                      ...(user.role === "Admin" ? (["Admin"] as UserRole[]) : []),
                    ].map((roleOption) => (
                      <SelectItem key={roleOption} value={roleOption}>
                        {roleOption === "Admin"
                          ? t("settings.users.adminLegacy")
                          : formatUserRoleLabel(roleOption)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            }
            if (column.id === "owner") {
              return (
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={user.isOwner}
                    onChange={(event) =>
                      void handleUpdateUserOwner(user.id, event.target.checked)
                    }
                    disabled={user.isOwner || !canManageRolePermissions}
                  />
                  {t("settings.users.owner")}
                </label>
              );
            }
            if (column.id === "admin") {
              return (
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={user.isOwner || user.isAdmin}
                    onChange={(event) =>
                      void handleUpdateUserAdmin(user.id, event.target.checked)
                    }
                    disabled={user.isOwner || !canManageRolePermissions}
                  />
                  {t("settings.users.admin")}
                </label>
              );
            }
            if (column.id === "actions") {
              const canRemove =
                canManageRolePermissions && user.id !== currentUserId && !user.isOwner;
              return (
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    {updatingUserId === user.id ? t("settings.users.saving") : ""}
                  </span>
                  <Tooltip content={t("settings.users.deactivateHint")}>
                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </Tooltip>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={!canRemove || deactivatingUserId === user.id}
                    onClick={() => void handleDeactivateUser(user.id)}
                  >
                    {deactivatingUserId === user.id
                      ? t("settings.users.deactivating")
                      : t("settings.users.deactivate")}
                  </Button>
                  <Tooltip content={t("settings.users.removeHint")}>
                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </Tooltip>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={
                      !canRemove ||
                      removingUserId === user.id ||
                      deactivatingUserId === user.id
                    }
                    onClick={() => void handleRemoveUserFromWorkspace(user.id)}
                  >
                    {removingUserId === user.id
                      ? t("settings.users.removing")
                      : t("settings.users.remove")}
                  </Button>
                </div>
              );
            }
            return "--";
          }}
        />

        <div className="space-y-2">
          <div className="text-sm font-medium">{t("settings.users.invites")}</div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-180 w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Full name</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isInvitesLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      <LoadingSpinner
                        className="justify-center"
                        label={t("settings.users.loadingInvites")}
                      />
                    </td>
                  </tr>
                ) : invites.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      {t("settings.users.noInvites")}
                    </td>
                  </tr>
                ) : (
                  invites.map((invite) => (
                    <tr key={invite.id} className="border-t border-border">
                      <td className="px-4 py-2">{invite.email}</td>
                      <td className="px-4 py-2">{invite.fullName ?? "--"}</td>
                      <td className="px-4 py-2">{invite.role}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {invite.acceptedAt
                          ? t("settings.users.accepted")
                          : t("settings.users.pending")}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleResendInvite(invite.email)}
                            disabled={
                              invite.acceptedAt !== null ||
                              !canManageRolePermissions ||
                              resendingInviteEmail === invite.email
                            }
                          >
                            {resendingInviteEmail === invite.email ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                                {t("settings.users.resending")}
                              </span>
                            ) : (
                              t("settings.users.resend")
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCancelInvite(invite.id)}
                            disabled={
                              invite.acceptedAt !== null ||
                              !canManageRolePermissions
                            }
                          >
                            {t("settings.common.cancel")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {inviteListMessage ? (
            <p
              className={`text-xs ${
                inviteListState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {inviteListMessage}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                {t("settings.users.rolePermissions")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("settings.users.rolePermissionsHint")}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => void handleSaveRolePermissions()}
              disabled={
                !canManageRolePermissions ||
                permissionState === "saving" ||
                !hasPermissionChanges
              }
            >
              {permissionState === "saving"
                ? t("settings.users.saving")
                : t("settings.users.saveRbac")}
            </Button>
          </div>
          {rolePermissionsLoading ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
              <LoadingSpinner label={t("settings.users.loadingRbac")} />
            </div>
          ) : null}
          {rolePermissionsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rolePermissionsError}
            </div>
          ) : null}
          {permissionMessage ? (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                permissionState === "error"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
              }`}
            >
              {permissionMessage}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-max w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    {t("settings.users.permission")}
                  </th>
                  {editablePermissionRoles.map((role) => (
                    <th
                      key={`perm-head-${role}`}
                      className="px-3 py-2 text-center font-medium whitespace-nowrap"
                    >
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionDefinitions.map((definition) => (
                  <tr
                    key={definition.key}
                    className="border-t border-border align-top"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{definition.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {definition.description}
                      </div>
                    </td>
                    {editablePermissionRoles.map((role) => {
                      const allowed =
                        permissionDrafts[definition.key]?.includes(role) ??
                        defaultPermissionRoles[definition.key].includes(role);
                      return (
                        <td
                          key={`${definition.key}-${role}`}
                          className="px-3 py-2 text-center"
                        >
                          <Checkbox
                            checked={allowed}
                            onChange={() => togglePermissionRole(definition.key, role)}
                            disabled={!canManageRolePermissions}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
