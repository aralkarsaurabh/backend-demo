import { CustomerRepository } from "../../../domain/repositories/CustomerRepository";
import { ListCustomersRequest } from "../../dto/customer/CustomerRequests";
import {
  CustomerListItemResponse,
  PaginationResponse,
  toCustomerListItem,
  toPaginationResponse,
} from "../../dto/customer/CustomerResponse";

export class ListCustomers {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(
    organizationId: string,
    query: ListCustomersRequest,
  ): Promise<{ customers: CustomerListItemResponse[]; pagination: PaginationResponse }> {
    const { items, totalItems } = await this.customers.list(organizationId, query);
    return {
      customers: items.map(toCustomerListItem),
      pagination: toPaginationResponse(query.page, query.limit, totalItems),
    };
  }
}
