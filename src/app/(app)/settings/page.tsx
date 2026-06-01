"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  GitBranchIcon,
  NetworkIcon,
  PanelRightIcon,
  PuzzleIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MobilePageTitle } from "@/components/layout/MobilePageTitle";
import { DesktopPageHeader } from "@/components/layout/DesktopPageHeader";
import { DetailTabsBar } from "@/components/layout/DetailTabsBar";
import { useHideMobileFloatingControls } from "@/hooks/useHideMobileFloatingControls";
import { useOrderFieldSettings } from "./OrderFieldSettingsContext";
import { PartnersExternalSchemaCard } from "./components/PartnersExternalSchemaCard";
import { PartnersManagementCard } from "./components/PartnersManagementCard";
import { UsersSettingsCard } from "./components/UsersSettingsCard";
import { OrderFieldsSettingsCard } from "./components/OrderFieldsSettingsCard";
import { ProductModelSettingsCard } from "./components/ProductModelSettingsCard";
import { IntegrationsSettingsCard } from "./components/IntegrationsSettingsCard";
import { useSettingsData } from "@/hooks/useSettingsData";
import {
  formatUserRoleLabel,
  normalizeUserRole,
  useAuthActions,
  useCurrentUser,
  type UserRole,
  userRoleOptions,
} from "@/contexts/UserContext";
import { useRbac } from "@/contexts/RbacContext";
import {
  defaultPermissionRoles,
  permissionDefinitions,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabaseClient";
import type {
  OrderInputFieldType,
  OrderInputGroupKey,
  OrderInputFieldScope,
  OrderInputTableColumn,
} from "@/types/orderInputs";
import {
  defaultConstructionTableColumns,
  getLocalizedConstructionColumnDisplayLabel,
  inferConstructionSemanticKey,
  localizeConstructionColumns,
  normalizeConstructionColumns,
  resolveConstructionSchemaTemplatePayload,
  type ConstructionSchemaTemplateRow,
} from "@/lib/domain/constructionSchema";
import type {
  ExternalJobFieldRole,
  ExternalJobFieldScope,
  ExternalJobFieldType,
} from "@/types/orders";
import { useI18n } from "@/lib/i18n/useI18n";
import { ORDER_CORE_FIELD_KEYS } from "@/lib/domain/orderCoreFields";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const integrations = [
  { id: "int-1", name: "Horizon", status: "Coming soon" },
  { id: "int-2", name: "Odoo", status: "Coming soon" },
  { id: "int-3", name: "SAP Business One", status: "Coming soon" },
  { id: "int-4", name: "QuickBooks", status: "Coming soon" },
  { id: "int-5", name: "Custom API", status: "Coming soon" },
];

const CONSTRUCTION_COLUMN_I18N_BY_KEY: Record<string, string> = {
  position: "settings.orderInputs.columnLabels.position",
  line_no: "settings.orderInputs.columnLabels.position",
  item_type: "settings.orderInputs.columnLabels.itemType",
  construction: "settings.orderInputs.columnLabels.itemType",
  type: "settings.orderInputs.columnLabels.itemType",
  tips: "settings.orderInputs.columnLabels.itemType",
  system: "settings.orderInputs.columnLabels.itemType",
  item_name: "settings.orderInputs.columnLabels.itemName",
  name: "settings.orderInputs.columnLabels.itemName",
  nosaukums: "settings.orderInputs.columnLabels.itemName",
  dimensions: "settings.orderInputs.columnLabels.dimensions",
  izmeri: "settings.orderInputs.columnLabels.dimensions",
  size: "settings.orderInputs.columnLabels.dimensions",
  qty: "settings.orderInputs.columnLabels.qty",
  quantity: "settings.orderInputs.columnLabels.qty",
  skaits: "settings.orderInputs.columnLabels.qty",
  material: "settings.orderInputs.columnLabels.material",
  materials: "settings.orderInputs.columnLabels.material",
  color: "settings.orderInputs.columnLabels.finishColor",
  colour: "settings.orderInputs.columnLabels.finishColor",
  apdare: "settings.orderInputs.columnLabels.finishColor",
  finish: "settings.orderInputs.columnLabels.finishColor",
  sku: "settings.orderInputs.columnLabels.sku",
  uom: "settings.orderInputs.columnLabels.uom",
  revision: "settings.orderInputs.columnLabels.revision",
  lifecycle_status: "settings.orderInputs.columnLabels.lifecycleStatus",
  valid_from: "settings.orderInputs.columnLabels.validFrom",
  valid_to: "settings.orderInputs.columnLabels.validTo",
  supply_type: "settings.orderInputs.columnLabels.supplyType",
  item_group: "settings.orderInputs.columnLabels.itemGroup",
  route_code: "settings.orderInputs.columnLabels.routeCode",
  net_weight: "settings.orderInputs.columnLabels.netWeight",
  volume: "settings.orderInputs.columnLabels.volume",
  default_supplier: "settings.orderInputs.columnLabels.defaultSupplier",
  quality_class: "settings.orderInputs.columnLabels.qualityClass",
  certification_required:
    "settings.orderInputs.columnLabels.certificationRequired",
  production_notes: "settings.orderInputs.columnLabels.productionNotes",
};

const CONSTRUCTION_COLUMN_HELPER_BY_KEY: Record<
  string,
  { lv: string; en: string; ru: string }
> = {
  position: { lv: "Rindas secība", en: "Line sequence", ru: "Порядок строки" },
  line_no: { lv: "Rindas secība", en: "Line sequence", ru: "Порядок строки" },
  item_type: {
    lv: "Produkta kategorija",
    en: "Product category",
    ru: "Категория изделия",
  },
  construction: {
    lv: "Produkta kategorija",
    en: "Product category",
    ru: "Категория изделия",
  },
  type: {
    lv: "Produkta kategorija",
    en: "Product category",
    ru: "Категория изделия",
  },
  tips: {
    lv: "Produkta kategorija",
    en: "Product category",
    ru: "Категория изделия",
  },
  system: {
    lv: "Produkta kategorija",
    en: "Product category",
    ru: "Категория изделия",
  },
  item_name: {
    lv: "Produkta nosaukums",
    en: "Product name",
    ru: "Название изделия",
  },
  name: {
    lv: "Produkta nosaukums",
    en: "Product name",
    ru: "Название изделия",
  },
  nosaukums: {
    lv: "Produkta nosaukums",
    en: "Product name",
    ru: "Название изделия",
  },
  dimensions: {
    lv: "Izmēru specifikācija",
    en: "Dimension spec",
    ru: "Спецификация размеров",
  },
  izmeri: {
    lv: "Izmēru specifikācija",
    en: "Dimension spec",
    ru: "Спецификация размеров",
  },
  size: {
    lv: "Izmēru specifikācija",
    en: "Dimension spec",
    ru: "Спецификация размеров",
  },
  qty: { lv: "Bāzes daudzums", en: "Base quantity", ru: "Базовое количество" },
  quantity: {
    lv: "Bāzes daudzums",
    en: "Base quantity",
    ru: "Базовое количество",
  },
  skaits: {
    lv: "Bāzes daudzums",
    en: "Base quantity",
    ru: "Базовое количество",
  },
  material: {
    lv: "Galvenais materiāls",
    en: "Main material",
    ru: "Основной материал",
  },
  materials: {
    lv: "Galvenais materiāls",
    en: "Main material",
    ru: "Основной материал",
  },
  color: { lv: "Apdares tonis", en: "Finish tone", ru: "Оттенок отделки" },
  colour: { lv: "Apdares tonis", en: "Finish tone", ru: "Оттенок отделки" },
  apdare: { lv: "Apdares tonis", en: "Finish tone", ru: "Оттенок отделки" },
  finish: { lv: "Apdares tonis", en: "Finish tone", ru: "Оттенок отделки" },
  sku: {
    lv: "Unikāls artikula identifikators",
    en: "Unique item identifier",
    ru: "Уникальный идентификатор артикула",
  },
  uom: {
    lv: "Noklusējuma mērvienība",
    en: "Default unit",
    ru: "Единица измерения",
  },
  revision: {
    lv: "Versijas numurs",
    en: "Revision version",
    ru: "Версия ревизии",
  },
  lifecycle_status: {
    lv: "Dzīves cikla statuss",
    en: "Lifecycle status",
    ru: "Статус жизненного цикла",
  },
  valid_from: {
    lv: "Spēkā stāšanās datums",
    en: "Effective from date",
    ru: "Дата начала действия",
  },
  valid_to: {
    lv: "Spēkā beigu datums",
    en: "Effective to date",
    ru: "Дата окончания действия",
  },
  supply_type: {
    lv: "Nodrošinājuma veids",
    en: "Supply model",
    ru: "Модель обеспечения",
  },
  item_group: {
    lv: "Produkta grupēšana",
    en: "Item grouping",
    ru: "Группировка изделия",
  },
  route_code: {
    lv: "Ražošanas maršruta kods",
    en: "Production route code",
    ru: "Код производственного маршрута",
  },
  net_weight: {
    lv: "Neto svars uz vienību",
    en: "Net weight per unit",
    ru: "Вес нетто на единицу",
  },
  volume: {
    lv: "Tilpums uz vienību",
    en: "Volume per unit",
    ru: "Объем на единицу",
  },
  default_supplier: {
    lv: "Noklusētais piegādātājs",
    en: "Default supplier",
    ru: "Поставщик по умолчанию",
  },
  quality_class: {
    lv: "Kvalitātes klase",
    en: "Quality class",
    ru: "Класс качества",
  },
  certification_required: {
    lv: "Sertifikācijas prasība",
    en: "Certification requirement",
    ru: "Требование сертификации",
  },
  production_notes: {
    lv: "Ražošanas piezīmes",
    en: "Production notes",
    ru: "Примечания производства",
  },
};

const defaultExternalRequestEmailSubjectTemplate =
  "PWS request {{order_number}} - action required";
const defaultExternalRequestEmailHtmlTemplate = `
<p>Sveiki,</p>
<p>Jūs saņēmāt jaunu ārējā darba pieprasījumu no {{customer_name}}.</p>
<p><strong>Pasūtījums:</strong> {{order_number}}</p>
<p><strong>Ārējais pasūtījums:</strong> {{external_order_number}}</p>
<p><strong>Termiņš:</strong> {{due_date}}</p>
{{comment_block}}
{{attachments_block}}
<p><a href="{{secure_form_link}}">Atvērt drošo formu</a></p>
<p>Šī saite beidzas {{expires_at}}.</p>
`.trim();
const defaultExternalRequestEmailTextTemplate = [
  "Sveiki,",
  "Pasūtījums: {{order_number}}",
  "Klients: {{customer_name}}",
  "Ārējais pasūtījums: {{external_order_number}}",
  "Termiņš: {{due_date}}",
  "{{comment_line}}",
  "{{attachments_line}}",
  "Drošā forma: {{secure_form_link}}",
  "Saite beidzas: {{expires_at}}",
].join("\n");

const lockedFieldKeys = new Set(ORDER_CORE_FIELD_KEYS);

const defaultFieldDescriptions: Record<string, string> = {
  order_number: "Unique order identifier shown in the main order list.",
  customer_name: "Customer or company for the order.",
  quantity: "Planned order quantity.",
  due_date: "Promised delivery date.",
  manager: "Sales/lead owner responsible for the order.",
  engineer: "Assigned engineer or designer handling the order.",
  priority: "Order urgency level used in planning and sorting.",
  status: "Current order workflow state.",
  actions: "Attachment and comment indicators shown in the list row.",
  delivery_address: "Delivery destination metadata field.",
  customer_phone: "Customer contact phone metadata field.",
};

const orderInputFieldTypeOptions: {
  value: OrderInputFieldType;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Multiline text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "toggle", label: "Toggle" },
  { value: "toggle_number", label: "Toggle + number" },
  { value: "table", label: "Table (repeatable rows)" },
];

const externalJobFieldTypeOptions: {
  value: ExternalJobFieldType;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Multiline text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "toggle", label: "Toggle" },
];

const externalJobFieldScopeOptions: {
  value: ExternalJobFieldScope;
  label: string;
}[] = [
  { value: "manual", label: "Manual entry" },
  { value: "portal_response", label: "Partner portal response" },
];

const externalJobFieldRoleOptions: {
  value: ExternalJobFieldRole;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "planned_price", label: "Planned price" },
  { value: "invoice_price", label: "Invoice price" },
];

const inactiveRoleOptions = new Set<UserRole>(["Dealer"]);

const settingsSections = [
  { value: "orderFields", icon: NetworkIcon },
  { value: "constructions", icon: PanelRightIcon },
  { value: "partners", icon: GitBranchIcon },
  { value: "users", icon: UsersIcon },
  { value: "integrations", icon: PuzzleIcon },
] as const;

type SettingsSectionValue = (typeof settingsSections)[number]["value"];

type ExternalTableColumnSetting = {
  id: string;
  visible: boolean;
  label?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const { signOut } = useAuthActions();
  const { t } = useI18n();
  const {
    permissions: rolePermissions,
    loading: rolePermissionsLoading,
    error: rolePermissionsError,
    hasPermission,
    savePermissionRoles,
  } = useRbac();
  const { confirm, dialog } = useConfirmDialog();
  const { orderFields, addOrderField, updateOrderField, removeOrderField } =
    useOrderFieldSettings();

  const sortedFields = useMemo(
    () => [...orderFields].sort((a, b) => a.order - b.order),
    [orderFields],
  );
  const [fieldName, setFieldName] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldActive, setFieldActive] = useState(true);
  const [fieldShowInTable, setFieldShowInTable] = useState(true);
  const [inlineEditingFieldId, setInlineEditingFieldId] = useState<
    string | null
  >(null);
  const [inlineFieldName, setInlineFieldName] = useState("");
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [fieldDropIndex, setFieldDropIndex] = useState<number | null>(null);

  const {
    orderInputFields,
    externalJobFields,
    partners,
    partnerGroups,
    isLoading: isSettingsDataLoading,
    addOrderInputField,
    updateOrderInputField,
    removeOrderInputField,
    ensureDefaultOrderInputFields,
    addExternalJobField,
    updateExternalJobField,
    removeExternalJobField,
    addPartner,
    updatePartner,
    removePartner,
    addPartnerGroup,
    updatePartnerGroup,
    removePartnerGroup,
  } = useSettingsData();
  const sortedOrderInputFields = useMemo(
    () =>
      [...orderInputFields].sort((a, b) => {
        if (a.groupKey !== b.groupKey) {
          return a.groupKey.localeCompare(b.groupKey);
        }
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.label.localeCompare(b.label);
      }),
    [orderInputFields],
  );
  const constructionConfigFields = useMemo(
    () =>
      sortedOrderInputFields.filter(
        (field) =>
          field.scope === "construction_table" ||
          field.scope === "construction_attribute" ||
          field.fieldType === "table",
      ),
    [sortedOrderInputFields],
  );
  const primaryConstructionTableField = useMemo(
    () =>
      constructionConfigFields.find(
        (field) => field.isPrimaryConstructionTable,
      ) ??
      constructionConfigFields.find(
        (field) =>
          field.scope === "construction_table" || field.fieldType === "table",
      ) ??
      null,
    [constructionConfigFields],
  );
  const constructionAttributeFields = useMemo(
    () =>
      constructionConfigFields.filter((field) => {
        if (primaryConstructionTableField?.id === field.id) {
          return false;
        }
        if (field.scope === "construction_attribute") {
          return true;
        }
        return !field.scope && field.groupKey === "production_scope";
      }),
    [constructionConfigFields, primaryConstructionTableField],
  );
  const constructionAttributeTypeOptions = useMemo(
    () =>
      orderInputFieldTypeOptions.filter((option) => option.value !== "table"),
    [],
  );
  const sortedExternalJobFields = useMemo(() => {
    const uniqueById = Array.from(
      new Map(externalJobFields.map((field) => [field.id, field])).values(),
    );
    return uniqueById.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.label.localeCompare(b.label);
    });
  }, [externalJobFields]);
  const externalTableColumnCatalog = useMemo(
    () => [
      { id: "sys.order_number", label: "Order #" },
      { id: "sys.customer_name", label: "Customer" },
      { id: "sys.partner_name", label: "Partner" },
      ...sortedExternalJobFields
        .filter((field) => field.showInTable ?? true)
        .map((field) => ({
          id: `field.${field.id}`,
          label: field.label,
        })),
      { id: "cmp.price_diff", label: "Price diff" },
      { id: "sys.received_at", label: "Received" },
      { id: "sys.added_by", label: "Added by" },
      { id: "sys.status", label: "Status" },
    ],
    [sortedExternalJobFields],
  );
  const externalTableColumnCatalogById = useMemo(
    () =>
      Object.fromEntries(
        externalTableColumnCatalog.map((column) => [column.id, column]),
      ),
    [externalTableColumnCatalog],
  );
  const externalJobFieldById = useMemo(
    () =>
      Object.fromEntries(
        sortedExternalJobFields.map((field) => [field.id, field]),
      ),
    [sortedExternalJobFields],
  );
  const [orderFieldLabel, setOrderFieldLabel] = useState("");
  const [orderFieldKey, setOrderFieldKey] = useState("");
  const [orderFieldType, setOrderFieldType] =
    useState<OrderInputFieldType>("text");
  const [orderFieldUnit, setOrderFieldUnit] = useState("");
  const [orderFieldOptions, setOrderFieldOptions] = useState("");
  const [orderFieldRequired, setOrderFieldRequired] = useState(false);
  const [orderFieldActive, setOrderFieldActive] = useState(true);
  const [orderFieldShowInTable, setOrderFieldShowInTable] = useState(true);
  const [orderFieldShowInProduction, setOrderFieldShowInProduction] =
    useState(false);
  const [orderFieldUseInBomTable, setOrderFieldUseInBomTable] = useState(false);
  const [editingOrderFieldId, setEditingOrderFieldId] = useState<string | null>(
    null,
  );
  const [externalJobFieldLabel, setExternalJobFieldLabel] = useState("");
  const [externalJobFieldType, setExternalJobFieldType] =
    useState<ExternalJobFieldType>("text");
  const [externalJobFieldScope, setExternalJobFieldScope] =
    useState<ExternalJobFieldScope>("manual");
  const [externalJobFieldRole, setExternalJobFieldRole] =
    useState<ExternalJobFieldRole>("none");
  const [externalJobFieldUnit, setExternalJobFieldUnit] = useState("");
  const [externalJobFieldOptions, setExternalJobFieldOptions] = useState("");
  const [externalJobFieldRequired, setExternalJobFieldRequired] =
    useState(false);
  const [externalJobFieldActive, setExternalJobFieldActive] = useState(true);
  const [externalJobFieldShowInTable, setExternalJobFieldShowInTable] =
    useState(true);
  const [externalJobFieldAiEnabled, setExternalJobFieldAiEnabled] =
    useState(false);
  const [externalJobFieldAiMatchOnly, setExternalJobFieldAiMatchOnly] =
    useState(false);
  const [externalJobFieldAiAliases, setExternalJobFieldAiAliases] =
    useState("");
  const [externalJobFieldSortOrder, setExternalJobFieldSortOrder] = useState(0);
  const [editingExternalJobFieldId, setEditingExternalJobFieldId] = useState<
    string | null
  >(null);
  const [selectedExternalJobFieldIds, setSelectedExternalJobFieldIds] =
    useState<string[]>([]);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [selectedPartnerGroupIds, setSelectedPartnerGroupIds] = useState<
    string[]
  >([]);
  const [editingConstructionColumnKey, setEditingConstructionColumnKey] =
    useState<string | null>(null);
  const [inlineConstructionColumnLabel, setInlineConstructionColumnLabel] =
    useState("");
  const [draggedConstructionColumnKey, setDraggedConstructionColumnKey] =
    useState<string | null>(null);
  const [constructionColumnDropIndex, setConstructionColumnDropIndex] =
    useState<number | null>(null);
  const [draggedConstructionFieldId, setDraggedConstructionFieldId] = useState<
    string | null
  >(null);
  const [constructionFieldDropIndex, setConstructionFieldDropIndex] = useState<
    number | null
  >(null);

  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [partnerGroupId, setPartnerGroupId] = useState<string>("");
  const [partnerGroupName, setPartnerGroupName] = useState("");
  const [editingPartnerGroupId, setEditingPartnerGroupId] = useState<
    string | null
  >(null);
  const [users, setUsers] = useState<
    {
      id: string;
      name: string;
      role: UserRole;
      isAdmin: boolean;
      isOwner: boolean;
    }[]
  >([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isTenantProfileLoading, setIsTenantProfileLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(
    null,
  );
  const [externalTableColumns, setExternalTableColumns] = useState<
    ExternalTableColumnSetting[]
  >([]);
  const [dragExternalTableColumnId, setDragExternalTableColumnId] = useState<
    string | null
  >(null);
  const [externalTableDropIndex, setExternalTableDropIndex] = useState<
    number | null
  >(null);
  const [externalTableState, setExternalTableState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [externalTableMessage, setExternalTableMessage] = useState("");
  const [externalPricingEnabled, setExternalPricingEnabled] = useState(false);
  const [externalPricingState, setExternalPricingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [externalPricingMessage, setExternalPricingMessage] = useState("");
  const [devRoleOverride, setDevRoleOverride] = useState(false);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const loadTenantSettings = async () => {
      const { data, error } = await sb
        .from("tenant_settings")
        .select(
          "external_price_reconciliation_enabled, external_table_columns",
        )
        .eq("tenant_id", currentUser.tenantId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        return;
      }
      if (typeof data.external_price_reconciliation_enabled === "boolean") {
        setExternalPricingEnabled(data.external_price_reconciliation_enabled);
      }
      if (Array.isArray(data.external_table_columns)) {
        setExternalTableColumns(
          data.external_table_columns
            .map((item) => {
              if (
                item &&
                typeof item === "object" &&
                "id" in item &&
                typeof (item as { id?: unknown }).id === "string"
              ) {
                return {
                  id: (item as { id: string }).id,
                  visible: (item as { visible?: unknown }).visible !== false,
                  label:
                    typeof (item as { label?: unknown }).label === "string"
                      ? (item as { label: string }).label
                      : undefined,
                } as ExternalTableColumnSetting;
              }
              return null;
            })
            .filter((item): item is ExternalTableColumnSetting =>
              Boolean(item),
            ),
        );
      }
    };
    void loadTenantSettings();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);
  const [companyName, setCompanyName] = useState("");
  const [outboundFromName, setOutboundFromName] = useState("");
  const [outboundFromEmail, setOutboundFromEmail] = useState("");
  const [outboundReplyToEmail, setOutboundReplyToEmail] = useState("");
  const [outboundUseUserSender, setOutboundUseUserSender] = useState(true);
  const [outboundSenderVerified, setOutboundSenderVerified] = useState(false);
  const [
    externalRequestEmailSubjectTemplate,
    setExternalRequestEmailSubjectTemplate,
  ] = useState(defaultExternalRequestEmailSubjectTemplate);
  const [
    externalRequestEmailHtmlTemplate,
    setExternalRequestEmailHtmlTemplate,
  ] = useState(defaultExternalRequestEmailHtmlTemplate);
  const [
    externalRequestEmailTextTemplate,
    setExternalRequestEmailTextTemplate,
  ] = useState(defaultExternalRequestEmailTextTemplate);
  const [outboundState, setOutboundState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [outboundMessage, setOutboundMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("Sales");
  const [inviteState, setInviteState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [inviteMessage, setInviteMessage] = useState("");
  const [isSecurityPromptOpen, setIsSecurityPromptOpen] = useState(false);
  const [securityPassword, setSecurityPassword] = useState("");
  const [securityState, setSecurityState] = useState<
    "idle" | "verifying" | "error"
  >("idle");
  const [securityMessage, setSecurityMessage] = useState("");
  const [privilegedVerifiedAt, setPrivilegedVerifiedAt] = useState<
    number | null
  >(null);
  const [pendingPrivilegedAction, setPendingPrivilegedAction] = useState<{
    run: () => Promise<void>;
  } | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState(rolePermissions);
  const [permissionState, setPermissionState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [permissionMessage, setPermissionMessage] = useState("");
  const [invites, setInvites] = useState<
    {
      id: string;
      email: string;
      fullName?: string | null;
      role: UserRole;
      invitedAt: string;
      acceptedAt?: string | null;
    }[]
  >([]);
  const [isInvitesLoading, setIsInvitesLoading] = useState(false);
  const [resendingInviteEmail, setResendingInviteEmail] = useState<
    string | null
  >(null);
  const [inviteListState, setInviteListState] = useState<
    "idle" | "sent" | "error"
  >("idle");
  const [inviteListMessage, setInviteListMessage] = useState("");
  const canManageRolePermissions = hasPermission("settings.manage");
  const privilegedSessionTtlMs = 5 * 60 * 1000;
  const hasPermissionChanges = useMemo(
    () => JSON.stringify(permissionDrafts) !== JSON.stringify(rolePermissions),
    [permissionDrafts, rolePermissions],
  );
  const editablePermissionRoles = useMemo(
    () =>
      userRoleOptions.filter(
        (role) => !inactiveRoleOptions.has(role) && role !== "Operator",
      ),
    [],
  );
  const assignableRoleOptions = useMemo(
    () =>
      userRoleOptions.filter(
        (role) => !inactiveRoleOptions.has(role) && role !== "Admin",
      ),
    [],
  );
  const optionLabel = (group: string, value: string, fallback: string) =>
    t(`settings.options.${group}.${value}`, { fallback }) ===
    `settings.options.${group}.${value}`
      ? fallback
      : t(`settings.options.${group}.${value}`);

  useEffect(() => {
    setPermissionDrafts(rolePermissions);
  }, [rolePermissions]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    let isMounted = true;
    const fetchCompany = async () => {
      setIsTenantProfileLoading(true);
      try {
        const { data, error } = await sb
          .from("tenants")
          .select(
            "name, legal_name, registration_no, vat_no, billing_email, address, logo_url, outbound_from_name, outbound_from_email, outbound_reply_to_email, outbound_use_user_sender, outbound_sender_verified, external_request_email_subject_template, external_request_email_html_template, external_request_email_text_template",
          )
          .eq("id", currentUser.tenantId)
          .maybeSingle();
        if (!isMounted || error || !data) {
          return;
        }
        setCompanyName(data.name ?? "");
        setOutboundFromName(data.outbound_from_name ?? "");
        setOutboundFromEmail(data.outbound_from_email ?? "");
        setOutboundReplyToEmail(data.outbound_reply_to_email ?? "");
        setOutboundUseUserSender(data.outbound_use_user_sender ?? true);
        setOutboundSenderVerified(data.outbound_sender_verified ?? false);
        setExternalRequestEmailSubjectTemplate(
          data.external_request_email_subject_template ??
            defaultExternalRequestEmailSubjectTemplate,
        );
        setExternalRequestEmailHtmlTemplate(
          data.external_request_email_html_template ??
            defaultExternalRequestEmailHtmlTemplate,
        );
        setExternalRequestEmailTextTemplate(
          data.external_request_email_text_template ??
            defaultExternalRequestEmailTextTemplate,
        );
      } finally {
        if (isMounted) {
          setIsTenantProfileLoading(false);
        }
      }
    };
    void fetchCompany();
    return () => {
      isMounted = false;
    };
  }, [currentUser.tenantId]);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !currentUser.tenantId) {
      return;
    }
    const fetchInvites = async () => {
      setIsInvitesLoading(true);
      const { data, error } = await sb
        .from("user_invites")
        .select("id, email, full_name, role, invited_at, accepted_at")
        .eq("tenant_id", currentUser.tenantId)
        .order("invited_at", { ascending: false });
      if (!error) {
        setInvites(
          (data ?? []).map((row) => ({
            id: row.id,
            email: row.email,
            fullName: row.full_name ?? null,
            role: normalizeUserRole(row.role),
            invitedAt: row.invited_at,
            acceptedAt: row.accepted_at,
          })),
        );
      }
      setIsInvitesLoading(false);
    };
    fetchInvites();
  }, [currentUser.tenantId]);

  async function handleInviteUser() {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!supabase || !currentUser.tenantId || !trimmed) {
      return;
    }
    setInviteState("sending");
    setInviteMessage("");
    const { data: inviteRow, error: insertError } = await supabase
      .from("user_invites")
      .insert({
        tenant_id: currentUser.tenantId,
        email: trimmed,
        full_name: inviteFullName.trim() || null,
        role: inviteRole,
        invited_by: currentUser.id,
      })
      .select("id, email, full_name, role, invited_at, accepted_at")
      .single();
    if (insertError || !inviteRow) {
      setInviteState("error");
      setInviteMessage(insertError.message);
      return;
    }
    let response: Response;
    try {
      response = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmed, mode: "invite" }),
      });
    } catch {
      await supabase.from("user_invites").delete().eq("id", inviteRow.id);
      setInviteState("error");
      setInviteMessage("Failed to send invite.");
      return;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      await supabase.from("user_invites").delete().eq("id", inviteRow.id);
      setInviteState("error");
      setInviteMessage(data.error ?? "Failed to send invite.");
      return;
    }
    setInviteState("sent");
    setInviteMessage("Invite sent.");
    setInviteEmail("");
    setInviteFullName("");
    setInvites((prev) => [
      {
        id: inviteRow.id,
        email: inviteRow.email,
        fullName: inviteRow.full_name ?? null,
        role: normalizeUserRole(inviteRow.role),
        invitedAt: inviteRow.invited_at,
        acceptedAt: inviteRow.accepted_at,
      },
      ...prev,
    ]);
  }

  async function handleResendInvite(email: string) {
    setResendingInviteEmail(email);
    setInviteListState("idle");
    setInviteListMessage("");
    try {
      const response = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, mode: "invite" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setInviteListState("error");
        setInviteListMessage(data.error ?? "Failed to resend invite.");
        return;
      }
      setInviteListState("sent");
      setInviteListMessage(`Invite resent to ${email}.`);
    } finally {
      setResendingInviteEmail(null);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!supabase) {
      return;
    }
    const { error } = await supabase
      .from("user_invites")
      .delete()
      .eq("id", inviteId);
    if (!error) {
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    }
  }

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setUsers([
        {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          isAdmin: currentUser.isAdmin,
          isOwner: currentUser.isOwner,
        },
      ]);
      return;
    }
    if (currentUser.loading || !currentUser.isAuthenticated) {
      setUsers([]);
      return;
    }
    let isMounted = true;
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      setUsersError(null);
      const query = sb
        .from("profiles")
        .select("id, full_name, role, tenant_id, is_admin, is_owner")
        .order("full_name", { ascending: true });
      if (currentUser.tenantId) {
        query.eq("tenant_id", currentUser.tenantId);
      }
      const { data, error } = await query;
      if (!isMounted) {
        return;
      }
      if (error) {
        setUsersError(error.message);
        setIsUsersLoading(false);
        return;
      }
      setUsers(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.full_name ?? "User",
          role: normalizeUserRole(row.role),
          isAdmin: row.is_admin ?? false,
          isOwner: row.is_owner ?? false,
        })),
      );
      setIsUsersLoading(false);
    };
    fetchUsers();
    return () => {
      isMounted = false;
    };
  }, [
    currentUser.id,
    currentUser.isAuthenticated,
    currentUser.loading,
    currentUser.name,
    currentUser.role,
    currentUser.isAdmin,
    currentUser.isOwner,
    currentUser.tenantId,
  ]);

  async function handleUpdateUserRole(userId: string, role: UserRole) {
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role } : user)),
      );
      return;
    }
    setUpdatingUserId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (error) {
      setUsersError(error.message);
      setUpdatingUserId(null);
      return;
    }
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role } : user)),
    );
    setUpdatingUserId(null);
    if (userId === currentUser.id) {
      await signOut();
      return;
    }
  }

  const hasFreshPrivilegedVerification = () =>
    privilegedVerifiedAt !== null &&
    Date.now() - privilegedVerifiedAt < privilegedSessionTtlMs;

  async function runPrivilegedAction(action: () => Promise<void>) {
    if (hasFreshPrivilegedVerification()) {
      await action();
      return;
    }
    setPendingPrivilegedAction({ run: action });
    setSecurityPassword("");
    setSecurityState("idle");
    setSecurityMessage("");
    setIsSecurityPromptOpen(true);
  }

  async function handleConfirmSecurityVerification() {
    if (!supabase) {
      setSecurityState("error");
      setSecurityMessage("Supabase is not configured.");
      return;
    }
    if (!currentUser.email) {
      setSecurityState("error");
      setSecurityMessage("Current user email is missing.");
      return;
    }
    if (!securityPassword.trim()) {
      setSecurityState("error");
      setSecurityMessage("Password is required.");
      return;
    }

    setSecurityState("verifying");
    setSecurityMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: securityPassword,
    });
    if (error || !data.user) {
      setSecurityState("error");
      setSecurityMessage(error?.message ?? "Verification failed.");
      return;
    }
    if (data.user.id !== currentUser.id) {
      setSecurityState("error");
      setSecurityMessage("Verification user mismatch.");
      return;
    }

    setPrivilegedVerifiedAt(Date.now());
    setIsSecurityPromptOpen(false);
    setSecurityPassword("");
    setSecurityState("idle");
    const action = pendingPrivilegedAction?.run;
    setPendingPrivilegedAction(null);
    if (action) {
      await action();
    }
  }

  function closeSecurityPrompt() {
    setIsSecurityPromptOpen(false);
    setSecurityPassword("");
    setSecurityState("idle");
    setSecurityMessage("");
    setPendingPrivilegedAction(null);
  }

  async function handleUpdateUserAdminInternal(
    userId: string,
    isAdmin: boolean,
  ) {
    const targetUser = users.find((user) => user.id === userId);
    if (targetUser?.isOwner && !isAdmin) {
      setUsersError("Owner must always keep admin access.");
      return;
    }
    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, isAdmin: user.isOwner ? true : isAdmin }
            : user,
        ),
      );
      return;
    }
    setUpdatingUserId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: isAdmin })
      .eq("id", userId);
    if (error) {
      setUsersError(error.message);
      setUpdatingUserId(null);
      return;
    }
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? { ...user, isAdmin: user.isOwner ? true : isAdmin }
          : user,
      ),
    );
    setUpdatingUserId(null);
  }

  async function handleUpdateUserAdmin(userId: string, isAdmin: boolean) {
    await runPrivilegedAction(() =>
      handleUpdateUserAdminInternal(userId, isAdmin),
    );
  }

  async function handleUpdateUserOwnerInternal(
    userId: string,
    isOwner: boolean,
  ) {
    if (!isOwner) {
      setUsersError("Owner cannot be removed directly. Assign another owner.");
      return;
    }

    const currentOwner = users.find((user) => user.isOwner);
    if (currentOwner?.id === userId) {
      return;
    }

    if (!supabase) {
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id === userId) {
            return { ...user, isOwner: true, isAdmin: true };
          }
          if (user.isOwner) {
            return { ...user, isOwner: false };
          }
          return user;
        }),
      );
      return;
    }

    setUpdatingUserId(userId);
    setUsersError(null);

    if (currentOwner) {
      const { error: demoteError } = await supabase
        .from("profiles")
        .update({ is_owner: false })
        .eq("id", currentOwner.id);
      if (demoteError) {
        setUsersError(demoteError.message);
        setUpdatingUserId(null);
        return;
      }
    }

    const { error: promoteError } = await supabase
      .from("profiles")
      .update({ is_owner: true, is_admin: true })
      .eq("id", userId);

    if (promoteError) {
      if (currentOwner) {
        await supabase
          .from("profiles")
          .update({ is_owner: true, is_admin: true })
          .eq("id", currentOwner.id);
      }
      setUsersError(promoteError.message);
      setUpdatingUserId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id === userId) {
          return { ...user, isOwner: true, isAdmin: true };
        }
        if (user.isOwner) {
          return { ...user, isOwner: false };
        }
        return user;
      }),
    );
    setUpdatingUserId(null);
  }

  async function handleUpdateUserOwner(userId: string, isOwner: boolean) {
    if (isOwner) {
      const approved = await confirm({
        title: t("settings.users.transferOwnershipTitle"),
        description: t("settings.users.transferOwnershipDescription"),
        confirmLabel: t("settings.users.transferOwner"),
        cancelLabel: t("settings.common.cancel"),
        destructive: true,
      });
      if (!approved) {
        return;
      }
    }
    await runPrivilegedAction(() =>
      handleUpdateUserOwnerInternal(userId, isOwner),
    );
  }

  async function handleRemoveUserFromWorkspaceInternal(userId: string) {
    if (!supabase) {
      return;
    }
    if (userId === currentUser.id) {
      setUsersError(t("settings.users.cannotRemoveOwnAccount"));
      return;
    }
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    if (targetUser.isOwner) {
      setUsersError(t("settings.users.ownerCannotBeRemoved"));
      return;
    }

    setRemovingUserId(userId);
    setUsersError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setUsersError(t("settings.users.sessionExpired"));
        return;
      }

      const response = await fetch("/api/settings/users/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setUsersError(data.error ?? t("settings.users.failedRemoveUser"));
        return;
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleRemoveUserFromWorkspace(userId: string) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    const approved = await confirm({
      title: t("settings.users.removeUserTitle"),
      description: t("settings.users.removeUserDescription", {
        name: targetUser.name,
      }),
      confirmLabel: t("settings.users.removeUser"),
      cancelLabel: t("settings.common.cancel"),
      destructive: true,
    });
    if (!approved) {
      return;
    }
    await runPrivilegedAction(() =>
      handleRemoveUserFromWorkspaceInternal(userId),
    );
  }

  async function handleDeactivateUserInternal(userId: string) {
    if (!supabase) {
      return;
    }
    if (userId === currentUser.id) {
      setUsersError(t("settings.users.cannotDeactivateOwnAccount"));
      return;
    }
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    if (targetUser.isOwner) {
      setUsersError(t("settings.users.ownerCannotBeDeactivated"));
      return;
    }

    setDeactivatingUserId(userId);
    setUsersError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setUsersError(t("settings.users.sessionExpired"));
        return;
      }

      const response = await fetch("/api/settings/users/deactivate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setUsersError(data.error ?? t("settings.users.failedDeactivateUser"));
        return;
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } finally {
      setDeactivatingUserId(null);
    }
  }

  async function handleDeactivateUser(userId: string) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      return;
    }
    const approved = await confirm({
      title: t("settings.users.deactivateUserTitle"),
      description: t("settings.users.deactivateUserDescription", {
        name: targetUser.name,
      }),
      confirmLabel: t("settings.users.deactivate"),
      cancelLabel: t("settings.common.cancel"),
      destructive: true,
    });
    if (!approved) {
      return;
    }
    await runPrivilegedAction(() => handleDeactivateUserInternal(userId));
  }

  function togglePermissionRole(permission: PermissionKey, role: UserRole) {
    setPermissionDrafts((prev) => {
      const current = prev[permission] ?? defaultPermissionRoles[permission];
      const hasRole = current.includes(role);
      return {
        ...prev,
        [permission]: hasRole
          ? current.filter((value) => value !== role)
          : [...current, role],
      };
    });
  }

  async function handleSaveRolePermissions() {
    if (!canManageRolePermissions) {
      return;
    }
    setPermissionState("saving");
    setPermissionMessage("");
    for (const def of permissionDefinitions) {
      const nextRoles =
        permissionDrafts[def.key] ?? defaultPermissionRoles[def.key];
      const currentRoles =
        rolePermissions[def.key] ?? defaultPermissionRoles[def.key];
      const unchanged =
        JSON.stringify([...nextRoles].sort()) ===
        JSON.stringify([...currentRoles].sort());
      if (unchanged) {
        continue;
      }
      const result = await savePermissionRoles(def.key, nextRoles);
      if (result.error) {
        setPermissionState("error");
        setPermissionMessage(result.error);
        return;
      }
    }
    setPermissionState("saved");
    setPermissionMessage(t("settings.users.rolePermissionsSaved"));
  }

  function resetFieldForm() {
    setFieldName("");
    setFieldRequired(false);
    setFieldActive(true);
    setFieldShowInTable(true);
  }

  function handleSaveField() {
    const trimmedName = fieldName.trim();
    if (!trimmedName) {
      return;
    }
    const normalizedKey = slugify(trimmedName);

    void addOrderField({
      name: trimmedName,
      key: normalizedKey,
      order: sortedFields.length + 1,
      isRequired: fieldRequired,
      isActive: fieldActive,
      showInTable: fieldShowInTable,
    });
    resetFieldForm();
  }

  function startInlineFieldEdit(fieldId: string) {
    const field = orderFields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }
    setInlineEditingFieldId(fieldId);
    setInlineFieldName(field.name);
  }

  function cancelInlineFieldEdit() {
    setInlineEditingFieldId(null);
    setInlineFieldName("");
  }

  async function handleSaveInlineField() {
    if (!inlineEditingFieldId) {
      return;
    }
    const trimmedName = inlineFieldName.trim();
    if (!trimmedName) {
      return;
    }
    await updateOrderField(inlineEditingFieldId, {
      name: trimmedName,
    });
    cancelInlineFieldEdit();
  }

  async function persistFieldOrder(nextFields: typeof sortedFields) {
    await Promise.all(
      nextFields.map((field, index) =>
        updateOrderField(field.id, {
          order: index + 1,
        }),
      ),
    );
  }

  async function handleDropField() {
    if (
      draggedFieldId === null ||
      fieldDropIndex === null ||
      sortedFields.length === 0
    ) {
      setDraggedFieldId(null);
      setFieldDropIndex(null);
      return;
    }

    const fromIndex = sortedFields.findIndex(
      (field) => field.id === draggedFieldId,
    );
    if (fromIndex === -1) {
      setDraggedFieldId(null);
      setFieldDropIndex(null);
      return;
    }

    let targetIndex = fieldDropIndex;
    if (fieldDropIndex > fromIndex) {
      targetIndex -= 1;
    }
    if (targetIndex === fromIndex) {
      setDraggedFieldId(null);
      setFieldDropIndex(null);
      return;
    }

    const reordered = [...sortedFields];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await persistFieldOrder(reordered);
    setDraggedFieldId(null);
    setFieldDropIndex(null);
  }

  async function handleCopyOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    const label = `${target.label} copy`;
    await addOrderInputField({
      key: slugify(label),
      label,
      groupKey: target.groupKey,
      scope: target.scope,
      fieldType: target.fieldType,
      unit: target.unit,
      options: target.options,
      columns: target.columns,
      isPrimaryConstructionTable: false,
      isRequired: target.isRequired,
      isActive: target.isActive,
      sortOrder: target.sortOrder + 1,
    });
  }

  async function handleCopyExternalJobField(fieldId: string) {
    const target = externalJobFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    const label = `${target.label} copy`;
    await addExternalJobField({
      key: slugify(label),
      label,
      fieldType: target.fieldType,
      scope: target.scope ?? "manual",
      fieldRole: target.fieldRole ?? "none",
      unit: target.unit,
      options: target.options,
      isRequired: target.isRequired,
      isActive: target.isActive,
      showInTable: target.showInTable ?? true,
      aiEnabled: target.aiEnabled ?? false,
      aiMatchOnly: target.aiMatchOnly ?? false,
      aiAliases: target.aiAliases ?? [],
      sortOrder: target.sortOrder + 1,
    });
  }

  async function handleCopyPartner(partnerId: string) {
    const partner = partners.find((item) => item.id === partnerId);
    if (!partner) {
      return;
    }
    await addPartner({
      name: `${partner.name} copy`,
      groupId: partner.groupId,
      email: partner.email,
      phone: partner.phone,
    });
  }

  async function handleSaveOutboundEmail() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setOutboundState("saving");
    setOutboundMessage("");
    const { error } = await supabase
      .from("tenants")
      .update({
        outbound_from_name: outboundFromName.trim() || null,
        outbound_from_email: outboundFromEmail.trim() || null,
        outbound_reply_to_email: outboundReplyToEmail.trim() || null,
        outbound_use_user_sender: outboundUseUserSender,
        outbound_sender_verified: outboundSenderVerified,
        external_request_email_subject_template:
          externalRequestEmailSubjectTemplate.trim() || null,
        external_request_email_html_template:
          externalRequestEmailHtmlTemplate.trim() || null,
        external_request_email_text_template:
          externalRequestEmailTextTemplate.trim() || null,
      })
      .eq("id", currentUser.tenantId);
    if (error) {
      setOutboundState("error");
      setOutboundMessage(
        error.message ?? "Failed to save outbound email settings.",
      );
      return;
    }
    setOutboundState("saved");
    setOutboundMessage("Outbound email settings saved.");
  }

  async function handleDeleteSelectedPartners() {
    if (selectedPartnerIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.partners.removeSelectedPartnersConfirm", {
          count: selectedPartnerIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedPartnerIds];
    for (const id of ids) {
      await removePartner(id);
    }
    setSelectedPartnerIds([]);
  }

  async function handleCopyPartnerGroup(groupId: string) {
    const group = partnerGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    await addPartnerGroup(`${group.name} copy`);
  }

  async function handleDeleteSelectedPartnerGroups() {
    if (selectedPartnerGroupIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.partners.removeSelectedGroupsConfirm", {
          count: selectedPartnerGroupIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedPartnerGroupIds];
    for (const id of ids) {
      await removePartnerGroup(id);
    }
    setSelectedPartnerGroupIds([]);
  }

  async function handleSaveExternalPricingSettings() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setExternalPricingState("saving");
    setExternalPricingMessage("");
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      external_price_reconciliation_enabled: externalPricingEnabled,
    });
    if (error) {
      setExternalPricingState("error");
      setExternalPricingMessage(
        error.message ?? "Failed to save price reconciliation settings.",
      );
      return;
    }
    setExternalPricingState("saved");
    setExternalPricingMessage("Saved.");
  }

  async function handleSaveExternalTableColumns() {
    if (!supabase || !currentUser.tenantId) {
      return;
    }
    setExternalTableState("saving");
    setExternalTableMessage("");
    const payload = externalTableColumns.map((item) => ({
      id: item.id,
      visible: item.visible,
      label: item.label?.trim() || null,
    }));
    const { error } = await supabase.from("tenant_settings").upsert({
      tenant_id: currentUser.tenantId,
      external_table_columns: payload,
    });
    if (error) {
      setExternalTableState("error");
      setExternalTableMessage(
        error.message ?? "Failed to save external table columns.",
      );
      return;
    }
    setExternalTableState("saved");
    setExternalTableMessage("Saved.");
  }

  function resetOrderFieldForm() {
    setOrderFieldLabel("");
    setOrderFieldKey("");
    setOrderFieldType("text");
    setOrderFieldUnit("");
    setOrderFieldOptions("");
    setOrderFieldRequired(false);
    setOrderFieldActive(true);
    setOrderFieldShowInTable(true);
    setOrderFieldShowInProduction(false);
    setOrderFieldUseInBomTable(false);
    setEditingOrderFieldId(null);
  }

  function resetExternalJobFieldForm() {
    setExternalJobFieldLabel("");
    setExternalJobFieldType("text");
    setExternalJobFieldScope("manual");
    setExternalJobFieldRole("none");
    setExternalJobFieldUnit("");
    setExternalJobFieldOptions("");
    setExternalJobFieldRequired(false);
    setExternalJobFieldActive(true);
    setExternalJobFieldShowInTable(true);
    setExternalJobFieldAiEnabled(false);
    setExternalJobFieldAiMatchOnly(false);
    setExternalJobFieldAiAliases("");
    setExternalJobFieldSortOrder(0);
    setEditingExternalJobFieldId(null);
  }

  function parseOrderFieldOptions(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    const parts = trimmed.split(/[,\n\\]+/);
    return parts.map((item) => item.trim()).filter(Boolean);
  }

  function getConstructionColumnDisplayLabel(
    column: OrderInputTableColumn,
    semanticKey: ReturnType<typeof inferConstructionSemanticKey>,
  ) {
    const localizedLabel = getLocalizedConstructionColumnDisplayLabel(
      column,
      currentUser.locale,
    );
    if (localizedLabel !== column.label) {
      return localizedLabel;
    }
    const translationKey =
      CONSTRUCTION_COLUMN_I18N_BY_KEY[column.key.toLowerCase()];
    if (translationKey) {
      return t(translationKey);
    }
    if (semanticKey === "position")
      return t("settings.orderInputs.columnLabels.position");
    if (semanticKey === "item_type")
      return t("settings.orderInputs.columnLabels.itemType");
    if (semanticKey === "item_name")
      return t("settings.orderInputs.columnLabels.itemName");
    if (semanticKey === "dimensions")
      return t("settings.orderInputs.columnLabels.dimensions");
    if (semanticKey === "qty")
      return t("settings.orderInputs.columnLabels.qty");
    if (semanticKey === "material")
      return t("settings.orderInputs.columnLabels.material");
    if (semanticKey === "color")
      return t("settings.orderInputs.columnLabels.finishColor");
    return column.label;
  }

  function getConstructionColumnHelperText(
    column: OrderInputTableColumn,
    semanticKey: ReturnType<typeof inferConstructionSemanticKey>,
  ) {
    const byKey = CONSTRUCTION_COLUMN_HELPER_BY_KEY[column.key.toLowerCase()];
    if (byKey) {
      if (currentUser.locale === "ru") return byKey.ru;
      if (currentUser.locale === "en") return byKey.en;
      return byKey.lv;
    }
    if (semanticKey === "custom") {
      return t("settings.orderInputs.columnSubtitleCustom");
    }
    return t("settings.orderInputs.columnSubtitleCore");
  }

  async function confirmRemove(message: string) {
    return confirm({ description: message });
  }

  async function updatePrimaryConstructionColumns(
    nextColumns: OrderInputTableColumn[],
  ) {
    if (!primaryConstructionTableField) {
      return;
    }
    await updateOrderInputField(primaryConstructionTableField.id, {
      columns: normalizeConstructionColumns(nextColumns).columns,
      isPrimaryConstructionTable: true,
    });
  }

  function startInlineConstructionColumnEdit(columnKey: string, label: string) {
    setEditingConstructionColumnKey(columnKey);
    setInlineConstructionColumnLabel(label);
  }

  function cancelInlineConstructionColumnEdit() {
    setEditingConstructionColumnKey(null);
    setInlineConstructionColumnLabel("");
  }

  async function handleSaveInlineConstructionColumn() {
    if (!primaryConstructionTableField || !editingConstructionColumnKey) {
      return;
    }
    const nextLabel = inlineConstructionColumnLabel.trim();
    if (!nextLabel) {
      return;
    }
    const nextColumns = (primaryConstructionTableField.columns ?? []).map(
      (column) =>
        column.key === editingConstructionColumnKey
          ? { ...column, label: nextLabel }
          : column,
    );
    await updatePrimaryConstructionColumns(nextColumns);
    cancelInlineConstructionColumnEdit();
  }

  useEffect(() => {
    if (!primaryConstructionTableField?.columns?.length) {
      return;
    }
    const normalized = normalizeConstructionColumns(
      primaryConstructionTableField.columns,
    );
    if (!normalized.changed) {
      return;
    }
    void updateOrderInputField(primaryConstructionTableField.id, {
      columns: normalized.columns,
      isPrimaryConstructionTable: true,
    });
  }, [
    primaryConstructionTableField?.columns,
    primaryConstructionTableField?.id,
    updateOrderInputField,
  ]);

  async function handleDropConstructionColumn() {
    const columns = primaryConstructionTableField?.columns ?? [];
    if (
      draggedConstructionColumnKey === null ||
      constructionColumnDropIndex === null ||
      columns.length === 0
    ) {
      setDraggedConstructionColumnKey(null);
      setConstructionColumnDropIndex(null);
      return;
    }

    const fromIndex = columns.findIndex(
      (column) => column.key === draggedConstructionColumnKey,
    );
    if (fromIndex === -1) {
      setDraggedConstructionColumnKey(null);
      setConstructionColumnDropIndex(null);
      return;
    }

    let targetIndex = constructionColumnDropIndex;
    if (constructionColumnDropIndex > fromIndex) {
      targetIndex -= 1;
    }
    if (targetIndex === fromIndex) {
      setDraggedConstructionColumnKey(null);
      setConstructionColumnDropIndex(null);
      return;
    }

    const reordered = [...columns];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await updatePrimaryConstructionColumns(reordered);
    setDraggedConstructionColumnKey(null);
    setConstructionColumnDropIndex(null);
  }

  useEffect(() => {
    if (externalJobFields.length === 0) {
      if (selectedExternalJobFieldIds.length > 0) {
        setSelectedExternalJobFieldIds([]);
      }
      return;
    }
    const valid = new Set(externalJobFields.map((field) => field.id));
    const next = selectedExternalJobFieldIds.filter((id) => valid.has(id));
    if (next.length !== selectedExternalJobFieldIds.length) {
      setSelectedExternalJobFieldIds(next);
    }
  }, [externalJobFields, selectedExternalJobFieldIds]);

  useEffect(() => {
    setExternalTableColumns((prev) => {
      const catalogIds = new Set(externalTableColumnCatalog.map((c) => c.id));
      const defaults = externalTableColumnCatalog.map((column) => ({
        id: column.id,
        visible: true,
      }));
      if (prev.length === 0) {
        return defaults;
      }
      const kept = prev.filter((item) => catalogIds.has(item.id));
      const missing = defaults.filter(
        (item) => !kept.some((existing) => existing.id === item.id),
      );
      const next = [...kept, ...missing];
      const isSame =
        next.length === prev.length &&
        next.every(
          (item, index) =>
            prev[index]?.id === item.id &&
            prev[index]?.visible === item.visible,
        );
      return isSame ? prev : next;
    });
  }, [externalTableColumnCatalog]);

  useEffect(() => {
    const valid = new Set(partners.map((partner) => partner.id));
    const next = selectedPartnerIds.filter((id) => valid.has(id));
    if (next.length !== selectedPartnerIds.length) {
      setSelectedPartnerIds(next);
    }
  }, [partners, selectedPartnerIds]);

  useEffect(() => {
    const valid = new Set(partnerGroups.map((group) => group.id));
    const next = selectedPartnerGroupIds.filter((id) => valid.has(id));
    if (next.length !== selectedPartnerGroupIds.length) {
      setSelectedPartnerGroupIds(next);
    }
  }, [partnerGroups, selectedPartnerGroupIds]);

  async function handleSaveExternalJobField() {
    const trimmedLabel = externalJobFieldLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const options =
      externalJobFieldType === "select"
        ? parseOrderFieldOptions(externalJobFieldOptions)
        : undefined;
    const aiAliases = parseOrderFieldOptions(externalJobFieldAiAliases);
    const normalizedFieldRole =
      externalJobFieldType === "number" ? externalJobFieldRole : "none";
    if (editingExternalJobFieldId) {
      await updateExternalJobField(editingExternalJobFieldId, {
        label: trimmedLabel,
        fieldType: externalJobFieldType,
        scope: externalJobFieldScope,
        fieldRole: normalizedFieldRole,
        unit: externalJobFieldUnit.trim() || undefined,
        options,
        isRequired: externalJobFieldRequired,
        isActive: externalJobFieldActive,
        showInTable: externalJobFieldShowInTable,
        aiEnabled: externalJobFieldAiEnabled,
        aiMatchOnly: externalJobFieldAiEnabled && externalJobFieldAiMatchOnly,
        aiAliases,
        sortOrder: Number.isFinite(externalJobFieldSortOrder)
          ? externalJobFieldSortOrder
          : 0,
      });
      resetExternalJobFieldForm();
      return;
    }
    await addExternalJobField({
      key: slugify(trimmedLabel),
      label: trimmedLabel,
      fieldType: externalJobFieldType,
      scope: externalJobFieldScope,
      fieldRole: normalizedFieldRole,
      unit: externalJobFieldUnit.trim() || undefined,
      options,
      isRequired: externalJobFieldRequired,
      isActive: externalJobFieldActive,
      showInTable: externalJobFieldShowInTable,
      aiEnabled: externalJobFieldAiEnabled,
      aiMatchOnly: externalJobFieldAiEnabled && externalJobFieldAiMatchOnly,
      aiAliases,
      sortOrder: Number.isFinite(externalJobFieldSortOrder)
        ? externalJobFieldSortOrder
        : 0,
    });
    resetExternalJobFieldForm();
  }

  function handleEditOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    setEditingOrderFieldId(fieldId);
    setOrderFieldLabel(target.label);
    setOrderFieldKey(target.key);
    setOrderFieldType(target.fieldType);
    setOrderFieldUnit(target.unit ?? "");
    setOrderFieldOptions((target.options ?? []).join(", "));
    setOrderFieldRequired(target.isRequired);
    setOrderFieldActive(target.isActive);
    setOrderFieldShowInTable(target.showInTable ?? true);
    setOrderFieldShowInProduction(target.showInProduction ?? false);
    setOrderFieldUseInBomTable(target.useInBomTable ?? false);
  }

  async function loadConstructionSchemaTemplates() {
    if (!supabase || !currentUser.tenantId) {
      return null;
    }
    const { data, error } = await supabase
      .from("construction_schema_templates")
      .select("template_type, payload")
      .eq("tenant_id", currentUser.tenantId)
      .eq("template_key", "default")
      .eq("is_active", true);
    if (error) {
      return null;
    }
    return resolveConstructionSchemaTemplatePayload(
      (data ?? []) as ConstructionSchemaTemplateRow[],
    );
  }

  async function handleCreateConstructionTable() {
    if (primaryConstructionTableField) {
      return;
    }
    const template = await loadConstructionSchemaTemplates();
    await addOrderInputField({
      key: "constructions",
      label: "Produkti / artikuli",
      groupKey: "production_scope",
      scope: "construction_table",
      fieldType: "table",
      columns:
        template?.primaryColumns ??
        localizeConstructionColumns(
          defaultConstructionTableColumns,
          currentUser.locale,
        ),
      isPrimaryConstructionTable: true,
      isBomImportTable: false,
      isRequired: false,
      isActive: true,
      showInProduction: true,
      sortOrder: 0,
    });
  }

  async function handleSaveConstructionAttribute() {
    if (orderFieldType === "table") {
      setOrderFieldType("text");
      return;
    }
    const trimmedLabel = orderFieldLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const resolvedKey = orderFieldKey.trim() || slugify(trimmedLabel);
    const options =
      orderFieldType === "select"
        ? parseOrderFieldOptions(orderFieldOptions)
        : undefined;
    const payload = {
      key: resolvedKey,
      label: trimmedLabel,
      groupKey: "production_scope" as OrderInputGroupKey,
      scope: "construction_attribute" as OrderInputFieldScope,
      fieldType: orderFieldType,
      unit: orderFieldUnit.trim() || undefined,
      options,
      columns: undefined,
      isPrimaryConstructionTable: false,
      isBomImportTable: false,
      isRequired: orderFieldRequired,
      isActive: orderFieldActive,
      showInTable: orderFieldShowInTable,
      showInProduction: orderFieldShowInProduction,
      useInBomTable: orderFieldUseInBomTable,
      sortOrder: editingOrderFieldId
        ? (orderInputFields.find((field) => field.id === editingOrderFieldId)
            ?.sortOrder ?? 0)
        : constructionAttributeFields.reduce(
            (maxSortOrder, field) => Math.max(maxSortOrder, field.sortOrder),
            -1,
          ) + 1,
    };
    if (editingOrderFieldId) {
      await updateOrderInputField(editingOrderFieldId, payload);
      resetOrderFieldForm();
      return;
    }
    await addOrderInputField(payload);
    resetOrderFieldForm();
  }

  async function persistConstructionAttributeOrder(
    nextFields: typeof constructionAttributeFields,
  ) {
    await Promise.all(
      nextFields.map((field, index) =>
        updateOrderInputField(field.id, {
          sortOrder: index + 1,
        }),
      ),
    );
  }

  async function handleDropConstructionAttribute() {
    if (
      draggedConstructionFieldId === null ||
      constructionFieldDropIndex === null ||
      constructionAttributeFields.length === 0
    ) {
      setDraggedConstructionFieldId(null);
      setConstructionFieldDropIndex(null);
      return;
    }

    const fromIndex = constructionAttributeFields.findIndex(
      (field) => field.id === draggedConstructionFieldId,
    );
    if (fromIndex === -1) {
      setDraggedConstructionFieldId(null);
      setConstructionFieldDropIndex(null);
      return;
    }

    let targetIndex = constructionFieldDropIndex;
    if (constructionFieldDropIndex > fromIndex) {
      targetIndex -= 1;
    }
    if (targetIndex === fromIndex) {
      setDraggedConstructionFieldId(null);
      setConstructionFieldDropIndex(null);
      return;
    }

    const reordered = [...constructionAttributeFields];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await persistConstructionAttributeOrder(reordered);
    setDraggedConstructionFieldId(null);
    setConstructionFieldDropIndex(null);
  }

  function handleEditExternalJobField(fieldId: string) {
    const target = externalJobFields.find((field) => field.id === fieldId);
    if (!target) {
      return;
    }
    setEditingExternalJobFieldId(fieldId);
    setExternalJobFieldLabel(target.label);
    setExternalJobFieldType(target.fieldType);
    setExternalJobFieldScope(target.scope ?? "manual");
    setExternalJobFieldRole(target.fieldRole ?? "none");
    setExternalJobFieldUnit(target.unit ?? "");
    setExternalJobFieldOptions((target.options ?? []).join(", "));
    setExternalJobFieldRequired(target.isRequired);
    setExternalJobFieldActive(target.isActive);
    setExternalJobFieldShowInTable(target.showInTable ?? true);
    setExternalJobFieldAiEnabled(target.aiEnabled ?? false);
    setExternalJobFieldAiMatchOnly(target.aiMatchOnly ?? false);
    setExternalJobFieldAiAliases((target.aiAliases ?? []).join(", "));
    setExternalJobFieldSortOrder(target.sortOrder);
  }

  async function handleDeleteOrderField(fieldId: string) {
    const target = orderInputFields.find((field) => field.id === fieldId);
    const label = target?.label ?? t("settings.orderInputs.label");
    if (
      !(await confirmRemove(
        t("settings.orderInputs.removeFieldConfirm", { label }),
      ))
    ) {
      return;
    }
    await removeOrderInputField(fieldId);
  }

  async function handleDeleteExternalJobField(fieldId: string) {
    const target = externalJobFields.find((field) => field.id === fieldId);
    const label = target?.label ?? t("settings.partners.externalFieldFallback");
    if (
      !(await confirmRemove(
        t("settings.partners.removeFieldConfirm", { label }),
      ))
    ) {
      return;
    }
    await removeExternalJobField(fieldId);
    setSelectedExternalJobFieldIds((prev) =>
      prev.filter((id) => id !== fieldId),
    );
  }

  async function handleDeleteSelectedExternalJobFields() {
    if (selectedExternalJobFieldIds.length === 0) {
      return;
    }
    if (
      !(await confirmRemove(
        t("settings.partners.removeSelectedFieldsConfirm", {
          count: selectedExternalJobFieldIds.length,
        }),
      ))
    ) {
      return;
    }
    const ids = [...selectedExternalJobFieldIds];
    for (const id of ids) {
      await removeExternalJobField(id);
    }
    setSelectedExternalJobFieldIds([]);
  }

  function reorderExternalTableColumns(
    columns: ExternalTableColumnSetting[],
    draggedId: string,
    toIndex: number,
  ) {
    const fromIndex = columns.findIndex((column) => column.id === draggedId);
    if (fromIndex === -1) {
      return columns;
    }
    const next = [...columns];
    const [moved] = next.splice(fromIndex, 1);
    const safeIndex = Math.max(0, Math.min(toIndex, next.length));
    next.splice(safeIndex, 0, moved);
    return next;
  }

  const externalSchemaTableColumns = useMemo(
    () => [
      {
        id: "label",
        label: t("settings.orderInputs.label"),
        widthClassName: "min-w-25 md:min-w-35",
      },
      {
        id: "type",
        label: t("settings.orderInputs.type"),
        widthClassName: "min-w-27.5 md:min-w-0",
      },
      {
        id: "scope",
        label: t("settings.partners.scope"),
        widthClassName: "min-w-30 md:min-w-0",
      },
      {
        id: "role",
        label: t("settings.users.role"),
        widthClassName: "min-w-27.5 md:min-w-0",
      },
      {
        id: "unit",
        label: t("settings.orderInputs.unit"),
        widthClassName: "min-w-[64px] md:min-w-0",
      },
      {
        id: "order",
        label: t("settings.orderInputs.order"),
        widthClassName: "min-w-[64px] md:min-w-0",
      },
      {
        id: "required",
        label: t("settings.common.required"),
        widthClassName: "min-w-[84px] md:min-w-0",
      },
      {
        id: "active",
        label: t("settings.common.active"),
        widthClassName: "min-w-[72px] md:min-w-0",
      },
      {
        id: "in_table",
        label: t("settings.orderFields.inTable"),
        widthClassName: "min-w-[84px] md:min-w-0",
      },
      {
        id: "ai",
        label: "AI",
        widthClassName: "min-w-[60px] md:min-w-0",
      },
      {
        id: "match_only",
        label: t("settings.partners.matchOnly"),
        widthClassName: "min-w-[96px] md:min-w-0",
      },
      {
        id: "actions",
        label: (
          <div className="flex items-center justify-end gap-2">
            <span>{t("settings.common.actions")}</span>
            <Checkbox
              variant="box"
              checked={
                sortedExternalJobFields.length > 0 &&
                selectedExternalJobFieldIds.length ===
                  sortedExternalJobFields.length
              }
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedExternalJobFieldIds(
                    sortedExternalJobFields.map((field) => field.id),
                  );
                } else {
                  setSelectedExternalJobFieldIds([]);
                }
              }}
            />
          </div>
        ),
        widthClassName: "min-w-[250px] md:min-w-0",
        headerClassName: "text-right",
      },
    ],
    [selectedExternalJobFieldIds.length, sortedExternalJobFields, t],
  );
  const usersAccessColumns = useMemo(
    () => [
      {
        id: "name",
        label: t("settings.users.name"),
        widthClassName: "min-w-[160px] md:min-w-[220px]",
      },
      {
        id: "role",
        label: t("settings.users.role"),
        widthClassName: "min-w-[140px] md:min-w-[180px]",
      },
      {
        id: "owner",
        label: t("settings.users.owner"),
        widthClassName: "min-w-22.5 md:min-w-27.5",
      },
      {
        id: "admin",
        label: t("settings.users.admin"),
        widthClassName: "min-w-22.5 md:min-w-27.5",
      },
      {
        id: "actions",
        label: t("settings.common.actions"),
        widthClassName: "min-w-25 md:min-w-30",
        headerClassName: "text-right",
      },
    ],
    [t],
  );
  function resetPartnerForm() {
    setPartnerName("");
    setPartnerEmail("");
    setPartnerPhone("");
    setPartnerGroupId("");
    setEditingPartnerId(null);
  }

  async function handleSavePartner() {
    const trimmedName = partnerName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingPartnerId) {
      await updatePartner(editingPartnerId, {
        name: trimmedName,
        groupId: partnerGroupId || undefined,
        email: partnerEmail.trim() || undefined,
        phone: partnerPhone.trim() || undefined,
      });
      resetPartnerForm();
      return;
    }
    await addPartner({
      name: trimmedName,
      groupId: partnerGroupId || undefined,
      email: partnerEmail.trim() || undefined,
      phone: partnerPhone.trim() || undefined,
    });
    resetPartnerForm();
  }

  function handleEditPartner(partnerId: string) {
    const partner = partners.find((item) => item.id === partnerId);
    if (!partner) {
      return;
    }
    setEditingPartnerId(partnerId);
    setPartnerName(partner.name);
    setPartnerEmail(partner.email ?? "");
    setPartnerPhone(partner.phone ?? "");
    setPartnerGroupId(partner.groupId ?? "");
  }

  function resetPartnerGroupForm() {
    setPartnerGroupName("");
    setEditingPartnerGroupId(null);
  }

  async function handleSavePartnerGroup() {
    const trimmedName = partnerGroupName.trim();
    if (!trimmedName) {
      return;
    }
    if (editingPartnerGroupId) {
      await updatePartnerGroup(editingPartnerGroupId, { name: trimmedName });
      resetPartnerGroupForm();
      return;
    }
    await addPartnerGroup(trimmedName);
    resetPartnerGroupForm();
  }

  function handleEditPartnerGroup(groupId: string) {
    const group = partnerGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    setEditingPartnerGroupId(groupId);
    setPartnerGroupName(group.name);
  }

  const [activeTab, setActiveTab] =
    useState<SettingsSectionValue>("orderFields");
  const [isMobileSectionsOpen, setIsMobileSectionsOpen] = useState(false);
  const [showCompactMobileTitle, setShowCompactMobileTitle] = useState(false);
  const hideMobileFloatingControls = useHideMobileFloatingControls();

  useEffect(() => {
    const tab = searchParams?.get("tab");
    const normalizedTab =
      tab === "structure"
        ? "orderFields"
        : tab === "orderInputs"
          ? "constructions"
          : tab;
    if (
      normalizedTab &&
      settingsSections.some((section) => section.value === normalizedTab)
    ) {
      setActiveTab(normalizedTab as SettingsSectionValue);
    }
  }, [searchParams]);

  const setActiveSettingsTab = (nextTab: string) => {
    const validTab = settingsSections.find(
      (section) => section.value === nextTab,
    );
    if (validTab) {
      setActiveTab(validTab.value);
      const current = new URLSearchParams(searchParams?.toString() ?? "");
      current.set("tab", nextTab);
      router.replace(`${pathname ?? "/settings"}?${current.toString()}`, {
        scroll: false,
      });
    }
  };

  useEffect(() => {
    if (!isMobileSectionsOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSectionsOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileSectionsOpen]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= 768) {
        setShowCompactMobileTitle(false);
        return;
      }
      setShowCompactMobileTitle(window.scrollY > 110);
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const sectionLabel = (value: SettingsSectionValue) =>
    t(`settings.section.${value}`);
  const sectionSubtitle = (value: SettingsSectionValue) =>
    t(`settings.sectionSubtitle.${value}`);

  const activeSectionValue = (settingsSections.find(
    (section) => section.value === activeTab,
  )?.value ?? "orderFields") as SettingsSectionValue;

  const activeSectionLabel = sectionLabel(activeSectionValue);
  const activeSectionSubtitle = sectionSubtitle(activeSectionValue);

  return (
    <section className="space-y-0 pt-16 md:space-y-4 md:pt-0">
      <div
        className={`fixed bottom-[calc(6.75rem+env(safe-area-inset-bottom))] right-4 z-40 transition-all duration-200 md:hidden ${
          hideMobileFloatingControls
            ? "translate-y-16 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg"
          onClick={() => setIsMobileSectionsOpen(true)}
          aria-label={t("settings.openSections")}
          aria-haspopup="dialog"
          aria-expanded={isMobileSectionsOpen}
          aria-controls="settings-sections-drawer"
        >
          <PanelRightIcon className="h-4 w-4" />
        </Button>
      </div>
      <MobilePageTitle
        title={activeSectionLabel}
        showCompact={showCompactMobileTitle}
        subtitle={activeSectionSubtitle}
        className="pt-6 pb-6"
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveSettingsTab}
        className="space-y-0 md:space-y-4"
      >
        <DesktopPageHeader
          sticky
          title={activeSectionLabel}
          subtitle={activeSectionSubtitle}
          className="settings-sticky-header md:z-20"
          actions={
            <DetailTabsBar
              tabs={settingsSections.map((section) => ({
                value: section.value,
                label: sectionLabel(section.value),
                icon: section.icon,
              }))}
              className="py-0"
            />
          }
        />

        {
          <>
            <BottomSheet
              id="settings-sections-drawer"
              open={isMobileSectionsOpen}
              onClose={() => setIsMobileSectionsOpen(false)}
              ariaLabel={t("settings.sections")}
              closeButtonLabel={t("settings.closeSections")}
              title={t("settings.sections")}
              enableSwipeToClose
            >
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-1">
                  {settingsSections.map((section) => {
                    const isActive = activeTab === section.value;
                    return (
                      <button
                        key={section.value}
                        type="button"
                        onClick={() => {
                          setActiveSettingsTab(section.value);
                          setIsMobileSectionsOpen(false);
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-muted/60"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <section.icon className="h-4 w-4" />
                          {sectionLabel(section.value)}
                        </span>
                        {isActive ? (
                          <span className="text-xs">
                            {t("settings.active")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </BottomSheet>
          </>
        }

        <TabsContent value="orderFields">
          <OrderFieldsSettingsCard
            t={t}
            isLoading={isSettingsDataLoading}
            sortedFields={sortedFields}
            inlineEditingFieldId={inlineEditingFieldId}
            inlineFieldName={inlineFieldName}
            setInlineFieldName={setInlineFieldName}
            draggedFieldId={draggedFieldId}
            setDraggedFieldId={setDraggedFieldId}
            fieldDropIndex={fieldDropIndex}
            setFieldDropIndex={setFieldDropIndex}
            lockedFieldKeys={lockedFieldKeys}
            defaultFieldDescriptions={defaultFieldDescriptions}
            updateOrderField={updateOrderField}
            handleDropField={handleDropField}
            handleSaveInlineField={handleSaveInlineField}
            startInlineFieldEdit={startInlineFieldEdit}
            cancelInlineFieldEdit={cancelInlineFieldEdit}
            confirmRemove={confirmRemove}
            removeOrderField={removeOrderField}
            fieldName={fieldName}
            setFieldName={setFieldName}
            fieldRequired={fieldRequired}
            setFieldRequired={setFieldRequired}
            fieldActive={fieldActive}
            setFieldActive={setFieldActive}
            fieldShowInTable={fieldShowInTable}
            setFieldShowInTable={setFieldShowInTable}
            handleSaveField={handleSaveField}
          />
        </TabsContent>

        <TabsContent value="constructions">
          <div className="space-y-6">
            <ProductModelSettingsCard
              t={t}
              optionLabel={optionLabel}
              orderInputFieldTypeOptions={orderInputFieldTypeOptions}
              constructionAttributeTypeOptions={
                constructionAttributeTypeOptions
              }
              primaryConstructionTableField={primaryConstructionTableField}
              constructionAttributeFields={constructionAttributeFields}
              handleCreateConstructionTable={handleCreateConstructionTable}
              ensureDefaultOrderInputFields={ensureDefaultOrderInputFields}
              updatePrimaryConstructionColumns={
                updatePrimaryConstructionColumns
              }
              handleDropConstructionColumn={handleDropConstructionColumn}
              startInlineConstructionColumnEdit={
                startInlineConstructionColumnEdit
              }
              handleSaveInlineConstructionColumn={
                handleSaveInlineConstructionColumn
              }
              cancelInlineConstructionColumnEdit={
                cancelInlineConstructionColumnEdit
              }
              editingConstructionColumnKey={editingConstructionColumnKey}
              inlineConstructionColumnLabel={inlineConstructionColumnLabel}
              setInlineConstructionColumnLabel={
                setInlineConstructionColumnLabel
              }
              draggedConstructionColumnKey={draggedConstructionColumnKey}
              setDraggedConstructionColumnKey={setDraggedConstructionColumnKey}
              constructionColumnDropIndex={constructionColumnDropIndex}
              setConstructionColumnDropIndex={setConstructionColumnDropIndex}
              getConstructionColumnDisplayLabel={
                getConstructionColumnDisplayLabel
              }
              getConstructionColumnHelperText={getConstructionColumnHelperText}
              handleDropConstructionAttribute={handleDropConstructionAttribute}
              draggedConstructionFieldId={draggedConstructionFieldId}
              setDraggedConstructionFieldId={setDraggedConstructionFieldId}
              constructionFieldDropIndex={constructionFieldDropIndex}
              setConstructionFieldDropIndex={setConstructionFieldDropIndex}
              editingOrderFieldId={editingOrderFieldId}
              handleEditOrderField={handleEditOrderField}
              handleCopyOrderField={handleCopyOrderField}
              handleDeleteOrderField={handleDeleteOrderField}
              updateOrderInputField={updateOrderInputField}
              orderFieldLabel={orderFieldLabel}
              setOrderFieldLabel={setOrderFieldLabel}
              orderFieldType={orderFieldType}
              setOrderFieldType={setOrderFieldType}
              orderFieldRequired={orderFieldRequired}
              setOrderFieldRequired={setOrderFieldRequired}
              orderFieldShowInTable={orderFieldShowInTable}
              setOrderFieldShowInTable={setOrderFieldShowInTable}
              orderFieldActive={orderFieldActive}
              setOrderFieldActive={setOrderFieldActive}
              orderFieldShowInProduction={orderFieldShowInProduction}
              setOrderFieldShowInProduction={setOrderFieldShowInProduction}
              orderFieldUseInBomTable={orderFieldUseInBomTable}
              setOrderFieldUseInBomTable={setOrderFieldUseInBomTable}
              handleSaveConstructionAttribute={handleSaveConstructionAttribute}
              resetOrderFieldForm={resetOrderFieldForm}
              orderFieldUnit={orderFieldUnit}
              setOrderFieldUnit={setOrderFieldUnit}
              orderFieldOptions={orderFieldOptions}
              setOrderFieldOptions={setOrderFieldOptions}
            />
          </div>
        </TabsContent>
        <TabsContent value="partners">
          <div className="space-y-6">
            <PartnersManagementCard
              t={t}
              isLoading={isSettingsDataLoading}
              partnerGroups={partnerGroups}
              partnerGroupName={partnerGroupName}
              setPartnerGroupName={setPartnerGroupName}
              editingPartnerGroupId={editingPartnerGroupId}
              handleSavePartnerGroup={handleSavePartnerGroup}
              resetPartnerGroupForm={resetPartnerGroupForm}
              selectedPartnerGroupIds={selectedPartnerGroupIds}
              setSelectedPartnerGroupIds={setSelectedPartnerGroupIds}
              handleDeleteSelectedPartnerGroups={
                handleDeleteSelectedPartnerGroups
              }
              updatePartnerGroup={updatePartnerGroup}
              handleEditPartnerGroup={handleEditPartnerGroup}
              handleCopyPartnerGroup={handleCopyPartnerGroup}
              confirmRemove={confirmRemove}
              removePartnerGroup={removePartnerGroup}
              partnerName={partnerName}
              setPartnerName={setPartnerName}
              partnerEmail={partnerEmail}
              setPartnerEmail={setPartnerEmail}
              partnerPhone={partnerPhone}
              setPartnerPhone={setPartnerPhone}
              partnerGroupId={partnerGroupId}
              setPartnerGroupId={setPartnerGroupId}
              editingPartnerId={editingPartnerId}
              handleSavePartner={handleSavePartner}
              resetPartnerForm={resetPartnerForm}
              selectedPartnerIds={selectedPartnerIds}
              setSelectedPartnerIds={setSelectedPartnerIds}
              partners={partners}
              handleDeleteSelectedPartners={handleDeleteSelectedPartners}
              updatePartner={updatePartner}
              handleEditPartner={handleEditPartner}
              handleCopyPartner={handleCopyPartner}
              removePartner={removePartner}
            />
            <PartnersExternalSchemaCard
              t={t}
              optionLabel={optionLabel}
              externalJobFields={externalJobFields}
              externalPricingEnabled={externalPricingEnabled}
              setExternalPricingEnabled={setExternalPricingEnabled}
              handleSaveExternalPricingSettings={
                handleSaveExternalPricingSettings
              }
              externalPricingState={externalPricingState}
              externalPricingMessage={externalPricingMessage}
              externalJobFieldLabel={externalJobFieldLabel}
              setExternalJobFieldLabel={setExternalJobFieldLabel}
              externalJobFieldType={externalJobFieldType}
              setExternalJobFieldType={setExternalJobFieldType}
              externalJobFieldTypeOptions={externalJobFieldTypeOptions}
              externalJobFieldScope={externalJobFieldScope}
              setExternalJobFieldScope={setExternalJobFieldScope}
              externalJobFieldScopeOptions={externalJobFieldScopeOptions}
              externalJobFieldRole={externalJobFieldRole}
              setExternalJobFieldRole={setExternalJobFieldRole}
              externalJobFieldRoleOptions={externalJobFieldRoleOptions}
              externalJobFieldSortOrder={externalJobFieldSortOrder}
              setExternalJobFieldSortOrder={setExternalJobFieldSortOrder}
              handleSaveExternalJobField={handleSaveExternalJobField}
              editingExternalJobFieldId={editingExternalJobFieldId}
              resetExternalJobFieldForm={resetExternalJobFieldForm}
              externalJobFieldUnit={externalJobFieldUnit}
              setExternalJobFieldUnit={setExternalJobFieldUnit}
              externalJobFieldOptions={externalJobFieldOptions}
              setExternalJobFieldOptions={setExternalJobFieldOptions}
              externalJobFieldAiAliases={externalJobFieldAiAliases}
              setExternalJobFieldAiAliases={setExternalJobFieldAiAliases}
              externalJobFieldRequired={externalJobFieldRequired}
              setExternalJobFieldRequired={setExternalJobFieldRequired}
              externalJobFieldActive={externalJobFieldActive}
              setExternalJobFieldActive={setExternalJobFieldActive}
              externalJobFieldShowInTable={externalJobFieldShowInTable}
              setExternalJobFieldShowInTable={setExternalJobFieldShowInTable}
              externalJobFieldAiEnabled={externalJobFieldAiEnabled}
              setExternalJobFieldAiEnabled={setExternalJobFieldAiEnabled}
              externalJobFieldAiMatchOnly={externalJobFieldAiMatchOnly}
              setExternalJobFieldAiMatchOnly={setExternalJobFieldAiMatchOnly}
              selectedExternalJobFieldIds={selectedExternalJobFieldIds}
              setSelectedExternalJobFieldIds={setSelectedExternalJobFieldIds}
              handleSaveExternalTableColumns={handleSaveExternalTableColumns}
              externalTableState={externalTableState}
              handleDeleteSelectedExternalJobFields={
                handleDeleteSelectedExternalJobFields
              }
              externalTableMessage={externalTableMessage}
              externalSchemaTableColumns={externalSchemaTableColumns}
              externalTableColumns={externalTableColumns}
              externalJobFieldById={externalJobFieldById}
              externalTableColumnCatalogById={externalTableColumnCatalogById}
              dragExternalTableColumnId={dragExternalTableColumnId}
              setDragExternalTableColumnId={setDragExternalTableColumnId}
              externalTableDropIndex={externalTableDropIndex}
              setExternalTableDropIndex={setExternalTableDropIndex}
              setExternalTableColumns={setExternalTableColumns}
              reorderExternalTableColumns={reorderExternalTableColumns}
              handleEditExternalJobField={handleEditExternalJobField}
              handleCopyExternalJobField={handleCopyExternalJobField}
              handleDeleteExternalJobField={handleDeleteExternalJobField}
            />
          </div>
        </TabsContent>
        <TabsContent value="users">
          <UsersSettingsCard
            t={t}
            isUsersLoading={isUsersLoading}
            isInvitesLoading={isInvitesLoading}
            rolePermissionsLoading={rolePermissionsLoading}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteFullName={inviteFullName}
            setInviteFullName={setInviteFullName}
            inviteRole={inviteRole}
            setInviteRole={setInviteRole}
            assignableRoleOptions={assignableRoleOptions}
            formatUserRoleLabel={formatUserRoleLabel}
            canManageRolePermissions={canManageRolePermissions}
            handleInviteUser={handleInviteUser}
            inviteState={inviteState}
            inviteMessage={inviteMessage}
            devRoleOverride={devRoleOverride}
            setDevRoleOverride={setDevRoleOverride}
            usersError={usersError}
            usersAccessColumns={usersAccessColumns}
            users={users}
            handleUpdateUserRole={handleUpdateUserRole}
            currentUserId={currentUser.id}
            handleUpdateUserOwner={handleUpdateUserOwner}
            handleUpdateUserAdmin={handleUpdateUserAdmin}
            updatingUserId={updatingUserId}
            deactivatingUserId={deactivatingUserId}
            removingUserId={removingUserId}
            handleDeactivateUser={handleDeactivateUser}
            handleRemoveUserFromWorkspace={handleRemoveUserFromWorkspace}
            invites={invites}
            handleResendInvite={handleResendInvite}
            resendingInviteEmail={resendingInviteEmail}
            handleCancelInvite={handleCancelInvite}
            inviteListState={inviteListState}
            inviteListMessage={inviteListMessage}
            handleSaveRolePermissions={handleSaveRolePermissions}
            permissionState={permissionState}
            hasPermissionChanges={hasPermissionChanges}
            rolePermissionsError={rolePermissionsError}
            permissionMessage={permissionMessage}
            editablePermissionRoles={editablePermissionRoles}
            permissionDefinitions={permissionDefinitions}
            permissionDrafts={permissionDrafts}
            defaultPermissionRoles={defaultPermissionRoles}
            togglePermissionRole={togglePermissionRole}
            showDevRoleOverride={process.env.NODE_ENV !== "production"}
          />
        </TabsContent>
        <IntegrationsSettingsCard
          t={t}
          isTenantProfileLoading={isTenantProfileLoading}
          outboundFromName={outboundFromName}
          setOutboundFromName={setOutboundFromName}
          outboundFromEmail={outboundFromEmail}
          setOutboundFromEmail={setOutboundFromEmail}
          outboundReplyToEmail={outboundReplyToEmail}
          setOutboundReplyToEmail={setOutboundReplyToEmail}
          outboundUseUserSender={outboundUseUserSender}
          setOutboundUseUserSender={setOutboundUseUserSender}
          outboundSenderVerified={outboundSenderVerified}
          setOutboundSenderVerified={setOutboundSenderVerified}
          companyName={companyName}
          canManageOutbound={currentUser.isAdmin}
          externalRequestEmailSubjectTemplate={
            externalRequestEmailSubjectTemplate
          }
          setExternalRequestEmailSubjectTemplate={
            setExternalRequestEmailSubjectTemplate
          }
          externalRequestEmailHtmlTemplate={externalRequestEmailHtmlTemplate}
          setExternalRequestEmailHtmlTemplate={
            setExternalRequestEmailHtmlTemplate
          }
          externalRequestEmailTextTemplate={externalRequestEmailTextTemplate}
          setExternalRequestEmailTextTemplate={
            setExternalRequestEmailTextTemplate
          }
          defaultExternalRequestEmailSubjectTemplate={
            defaultExternalRequestEmailSubjectTemplate
          }
          defaultExternalRequestEmailHtmlTemplate={
            defaultExternalRequestEmailHtmlTemplate
          }
          defaultExternalRequestEmailTextTemplate={
            defaultExternalRequestEmailTextTemplate
          }
          handleSaveOutboundEmail={handleSaveOutboundEmail}
          outboundState={outboundState}
          outboundMessage={outboundMessage}
          integrations={integrations}
        />
      </Tabs>
      <BottomSheet
        open={isSecurityPromptOpen}
        onClose={closeSecurityPrompt}
        ariaLabel={t("settings.security.ariaLabel")}
        title={t("settings.security.title")}
        closeButtonLabel={t("settings.security.close")}
        enableSwipeToClose
      >
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.security.description")}
          </p>
          <label className="space-y-2 text-sm font-medium">
            {t("settings.security.password")}
            <Input
              type="password"
              value={securityPassword}
              onChange={(event) => {
                setSecurityPassword(event.target.value);
                if (securityState === "error") {
                  setSecurityState("idle");
                  setSecurityMessage("");
                }
              }}
              className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
              autoComplete="current-password"
            />
          </label>
          {securityMessage ? (
            <p className="text-xs text-destructive">{securityMessage}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={closeSecurityPrompt}>
              {t("settings.common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmSecurityVerification}
              disabled={securityState === "verifying"}
            >
              {securityState === "verifying"
                ? t("settings.security.verifying")
                : t("settings.security.confirm")}
            </Button>
          </div>
        </div>
      </BottomSheet>
      {isSecurityPromptOpen ? (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 md:flex">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {t("settings.security.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.security.description")}
            </p>
            <label className="mt-4 block space-y-2 text-sm font-medium">
              {t("settings.security.password")}
              <Input
                type="password"
                value={securityPassword}
                onChange={(event) => {
                  setSecurityPassword(event.target.value);
                  if (securityState === "error") {
                    setSecurityState("idle");
                    setSecurityMessage("");
                  }
                }}
                className="h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm"
                autoComplete="current-password"
              />
            </label>
            {securityMessage ? (
              <p className="mt-2 text-xs text-destructive">{securityMessage}</p>
            ) : null}
            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeSecurityPrompt}>
                {t("settings.common.cancel")}
              </Button>
              <Button
                onClick={handleConfirmSecurityVerification}
                disabled={securityState === "verifying"}
              >
                {securityState === "verifying"
                  ? t("settings.security.verifying")
                  : t("settings.security.confirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
