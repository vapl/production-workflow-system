export interface Partner {
  id: string;
  name: string;
  groupId?: string;
  isActive: boolean;
}

export interface PartnerGroup {
  id: string;
  name: string;
  isActive: boolean;
}
