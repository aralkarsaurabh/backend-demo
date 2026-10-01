import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdateLeadRequest } from "../../dto/lead/LeadRequests";
import { LeadResponse, toLeadResponse } from "../../dto/lead/LeadResponse";
import { AssignLead } from "./AssignLead";

export class UpdateLead {
  constructor(
    private readonly leads: LeadRepository,
    private readonly assignLead: AssignLead,
  ) {}

  async execute(
    organizationId: string,
    leadId: string,
    request: UpdateLeadRequest,
  ): Promise<{ lead: LeadResponse }> {
    const existing = await this.leads.findById(organizationId, leadId);
    if (!existing) throw new AppError(ErrorCode.LEAD_NOT_FOUND);
    if (existing.status === "CONVERTED") throw new AppError(ErrorCode.LEAD_ALREADY_CONVERTED);

    if (request.assignedToUserId) {
      await this.assignLead.execute(organizationId, request.assignedToUserId);
    }

    const lead = await this.leads.update(organizationId, leadId, request);
    if (!lead) {
      // The guarded update matched nothing: the lead was converted (or deleted) just now.
      const current = await this.leads.findById(organizationId, leadId);
      throw new AppError(current ? ErrorCode.LEAD_ALREADY_CONVERTED : ErrorCode.LEAD_NOT_FOUND);
    }
    return { lead: toLeadResponse(lead) };
  }
}
