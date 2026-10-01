export interface Customer {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
