import { CustomerRepository } from "../../../domain/repositories/CustomerRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export class DeleteCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  /** Hard delete (D20). A customer of another organization is simply not found. */
  async execute(organizationId: string, customerId: string): Promise<void> {
    const deleted = await this.customers.delete(organizationId, customerId);
    if (!deleted) throw new AppError(ErrorCode.CUSTOMER_NOT_FOUND);
  }
}
