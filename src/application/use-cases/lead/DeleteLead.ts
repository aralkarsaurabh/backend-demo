import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export class DeleteLead {
  constructor(private readonly leads: LeadRepository) {}

  /** Hard delete (D28), also for a converted lead; its customer is not touched. */
  async execute(organizationId: string, leadId: string): Promise<void> {
    const deleted = await this.leads.delete(organizationId, leadId);
    if (!deleted) throw new AppError(ErrorCode.LEAD_NOT_FOUND);
  }
}
