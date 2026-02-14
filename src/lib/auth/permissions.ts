import type { CurrentUser, UserRole } from "@/contexts/UserContext";

export type PermissionKey =
  | "dashboard.view"
  | "settings.view"
  | "settings.manage"
  | "production.view"
  | "production.operator.view"
  | "orders.manage";

export type PermissionRoleMap = Record<PermissionKey, UserRole[]>;

export const permissionDefinitions: Array<{
  key: PermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: "dashboard.view",
    label: "Dashboard view",
    description: "Can access dashboard page.",
  },
  {
    key: "settings.view",
    label: "Settings view",
    description: "Can open settings page.",
  },
  {
    key: "settings.manage",
    label: "Settings manage",
    description: "Can change settings, users and RBAC rules.",
  },
  {
    key: "production.view",
    label: "Production view",
    description: "Can access production planner page.",
  },
  {
    key: "production.operator.view",
    label: "Production operator view",
    description: "Can access operator station page.",
  },
  {
    key: "orders.manage",
    label: "Orders manage",
    description: "Can create, edit and delete orders.",
  },
];

export const defaultPermissionRoles: PermissionRoleMap = {
  "dashboard.view": ["Admin"],
  "settings.view": ["Admin"],
  "settings.manage": ["Admin"],
  "production.view": ["Admin", "Production manager", "Production"],
  "production.operator.view": [
    "Admin",
    "Production manager",
    "Production worker",
    "Production",
  ],
  "orders.manage": ["Admin", "Sales"],
};

type AppRoute =
  | "/"
  | "/orders"
  | "/production"
  | "/production/operator"
  | "/settings"
  | "/company";

function dedupeRoles(roles: UserRole[]) {
  return Array.from(new Set(roles));
}

function normalizeRoles(roles: UserRole[] | undefined, fallback: UserRole[]) {
  return dedupeRoles(roles && roles.length > 0 ? roles : fallback);
}

export function mergePermissionRoles(
  partial?: Partial<Record<PermissionKey, UserRole[]>>,
): PermissionRoleMap {
  return {
    "dashboard.view": normalizeRoles(
      partial?.["dashboard.view"],
      defaultPermissionRoles["dashboard.view"],
    ),
    "settings.view": normalizeRoles(
      partial?.["settings.view"],
      defaultPermissionRoles["settings.view"],
    ),
    "settings.manage": normalizeRoles(
      partial?.["settings.manage"],
      defaultPermissionRoles["settings.manage"],
    ),
    "production.view": normalizeRoles(
      partial?.["production.view"],
      defaultPermissionRoles["production.view"],
    ),
    "production.operator.view": normalizeRoles(
      partial?.["production.operator.view"],
      defaultPermissionRoles["production.operator.view"],
    ),
    "orders.manage": normalizeRoles(
      partial?.["orders.manage"],
      defaultPermissionRoles["orders.manage"],
    ),
  };
}

export function isOwner(user: Pick<CurrentUser, "isOwner">) {
  return user.isOwner;
}

export function isAdminLike(
  user: Pick<CurrentUser, "role" | "isAdmin" | "isOwner">,
) {
  return user.isOwner || user.isAdmin || user.role === "Admin";
}

export function isProductionWorker(user: Pick<CurrentUser, "role">) {
  return user.role === "Production worker";
}

export function hasPermission(
  user: Pick<CurrentUser, "role" | "isAdmin" | "isOwner">,
  permission: PermissionKey,
  roleMap: PermissionRoleMap = defaultPermissionRoles,
) {
  if (isAdminLike(user)) {
    return true;
  }
  return roleMap[permission].includes(user.role);
}

export function canAccessRoute(
  route: AppRoute,
  user: Pick<CurrentUser, "role" | "isAdmin" | "isOwner">,
  roleMap: PermissionRoleMap = defaultPermissionRoles,
) {
  if (isProductionWorker(user)) {
    return route === "/production/operator";
  }
  if (route === "/") return hasPermission(user, "dashboard.view", roleMap);
  if (route === "/settings")
    return hasPermission(user, "settings.view", roleMap);
  if (route === "/production")
    return hasPermission(user, "production.view", roleMap);
  if (route === "/production/operator")
    return hasPermission(user, "production.operator.view", roleMap);
  if (route === "/company") return isAdminLike(user);
  return true;
}

export function isProductionRole(
  user: Pick<CurrentUser, "role" | "isAdmin" | "isOwner">,
  roleMap: PermissionRoleMap = defaultPermissionRoles,
) {
  return (
    hasPermission(user, "production.view", roleMap) ||
    hasPermission(user, "production.operator.view", roleMap) ||
    user.role === "Engineering"
  );
}
