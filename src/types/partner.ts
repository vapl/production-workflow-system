export interface Partner {
  id: string;
  name: string;
  groupId?: string;
  email?: string;
  phone?: string;
  isActive: boolean;
}

export interface PartnerGroup {
  id: string;
  name: string;
  isActive: boolean;
}
