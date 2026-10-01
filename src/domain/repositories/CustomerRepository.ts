import { Customer } from "../entities/Customer";

export interface CreateCustomerData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

/** A field left out is unchanged; `null` clears an optional field. */
export interface UpdateCustomerData {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

/** The only fields a list may be sorted by. Anything else is rejected before the database. */
export const CUSTOMER_SORT_FIELDS = ["createdAt", "name", "company"] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";

export interface CustomerListQuery {
  /** 1-based. */
  page: number;
  limit: number;
  /** Substring of name, email, phone or company, ignoring case. */
  search?: string;
  /** Exact company, ignoring case. */
  company?: string;
  /** Inclusive bounds on createdAt. */
  createdFrom?: Date;
  createdTo?: Date;
  sortBy: CustomerSortField;
  sortOrder: SortOrder;
}

export interface CustomerPage {
  items: Customer[];
  /** Every customer matching the filters, not just this page. */
  totalItems: number;
}

/**
 * Every method takes the organization id, so a query can never reach another
 * organization's customers (decision D16).
 */
export interface CustomerRepository {
  create(organizationId: string, data: CreateCustomerData): Promise<Customer>;

  /** Null when there is no such customer in this organization. */
  findById(organizationId: string, customerId: string): Promise<Customer | null>;

  /** Null when there is no such customer in this organization; nothing is changed then. */
  update(
    organizationId: string,
    customerId: string,
    data: UpdateCustomerData,
  ): Promise<Customer | null>;

  /** True if a customer was deleted; false, changing nothing, if none matched. */
  delete(organizationId: string, customerId: string): Promise<boolean>;

  /**
   * One page of the organization's customers. The order is always deterministic: the
   * chosen field, then `id` in the same direction, so equal values never reshuffle pages.
   */
  list(organizationId: string, query: CustomerListQuery): Promise<CustomerPage>;
}
