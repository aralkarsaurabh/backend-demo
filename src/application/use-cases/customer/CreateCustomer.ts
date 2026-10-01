import { CustomerRepository } from "../../../domain/repositories/CustomerRepository";
import { CreateCustomerRequest } from "../../dto/customer/CustomerRequests";
import { CustomerResponse, toCustomerResponse } from "../../dto/customer/CustomerResponse";

export class CreateCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  /** `organizationId` is the caller's verified organization, never a body field. */
  async execute(
    organizationId: string,
    request: CreateCustomerRequest,
  ): Promise<{ customer: CustomerResponse }> {
    const customer = await this.customers.create(organizationId, request);
    return { customer: toCustomerResponse(customer) };
  }
}
