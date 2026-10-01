import { Customer } from "../entities/Customer";

export interface CreateCustomerData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

/**
 * Every method takes the organization id, so a query can never reach another
 * organization's customers (decision D16).
 */
export interface CustomerRepository {
  create(organizationId: string, data: CreateCustomerData): Promise<Customer>;

  /** Null when there is no such customer in this organization. */
  findById(organizationId: string, customerId: string): Promise<Customer | null>;
}
