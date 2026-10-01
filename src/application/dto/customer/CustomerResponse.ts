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

/** A list item leaves out the free-text notes. */
export type CustomerListItemResponse = Omit<CustomerResponse, "notes">;

export const toCustomerListItem = (customer: Customer): CustomerListItemResponse => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  company: customer.company,
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});

export interface PaginationResponse {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export const toPaginationResponse = (
  page: number,
  limit: number,
  totalItems: number,
): PaginationResponse => {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};
