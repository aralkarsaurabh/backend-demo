import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { LeadResponse, toLeadResponse } from "../../dto/lead/LeadResponse";

export class GetLead {
  constructor(private readonly leads: LeadRepository) {}

  async execute(organizationId: string, leadId: string): Promise<{ lead: LeadResponse }> {
    const lead = await this.leads.findById(organizationId, leadId);
    if (!lead) throw new AppError(ErrorCode.LEAD_NOT_FOUND);
    return { lead: toLeadResponse(lead) };
  }
}
