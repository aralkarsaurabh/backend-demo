import { Customer } from "../../../domain/entities/Customer";

export interface CustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Never includes `organizationId`: the client already has it in the URL. */
export const toCustomerResponse = (customer: Customer): CustomerResponse => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  company: customer.company,
  notes: customer.notes,
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});
