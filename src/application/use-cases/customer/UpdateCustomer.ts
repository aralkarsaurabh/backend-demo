import { CustomerRepository } from "../../../domain/repositories/CustomerRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdateCustomerRequest } from "../../dto/customer/CustomerRequests";
import { CustomerResponse, toCustomerResponse } from "../../dto/customer/CustomerResponse";

export class UpdateCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(
    organizationId: string,
    customerId: string,
    request: UpdateCustomerRequest,
  ): Promise<{ customer: CustomerResponse }> {
    const customer = await this.customers.update(organizationId, customerId, request);
    if (!customer) throw new AppError(ErrorCode.CUSTOMER_NOT_FOUND);
    return { customer: toCustomerResponse(customer) };
  }
}
