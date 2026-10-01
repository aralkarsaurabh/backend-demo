import { CustomerRepository } from "../../../domain/repositories/CustomerRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { CustomerResponse, toCustomerResponse } from "../../dto/customer/CustomerResponse";

export class GetCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(
    organizationId: string,
    customerId: string,
  ): Promise<{ customer: CustomerResponse }> {
    const customer = await this.customers.findById(organizationId, customerId);
    if (!customer) throw new AppError(ErrorCode.CUSTOMER_NOT_FOUND);
    return { customer: toCustomerResponse(customer) };
  }
}
