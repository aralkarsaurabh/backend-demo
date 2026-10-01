import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { CustomerResponse, toCustomerResponse } from "../../dto/customer/CustomerResponse";
import { LeadResponse, toLeadResponse } from "../../dto/lead/LeadResponse";

export class ConvertLead {
  constructor(private readonly leads: LeadRepository) {}

  /** The customer and the converted lead come from one atomic repository call (D30). */
  async execute(
    organizationId: string,
    leadId: string,
  ): Promise<{ lead: LeadResponse; customer: CustomerResponse }> {
    const existing = await this.leads.findById(organizationId, leadId);
    if (!existing) throw new AppError(ErrorCode.LEAD_NOT_FOUND);
    if (existing.status === "CONVERTED") throw new AppError(ErrorCode.LEAD_ALREADY_CONVERTED);

    const converted = await this.leads.convert(organizationId, leadId);
    if (!converted) throw new AppError(ErrorCode.LEAD_NOT_FOUND);
    return { lead: toLeadResponse(converted.lead), customer: toCustomerResponse(converted.customer) };
  }
}
