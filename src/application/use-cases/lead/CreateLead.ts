import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { CreateLeadRequest } from "../../dto/lead/LeadRequests";
import { LeadResponse, toLeadResponse } from "../../dto/lead/LeadResponse";

export class CreateLead {
  constructor(private readonly leads: LeadRepository) {}

  /** `organizationId` is the caller's verified organization, never a body field. */
  async execute(organizationId: string, request: CreateLeadRequest): Promise<{ lead: LeadResponse }> {
    const lead = await this.leads.create(organizationId, request);
    return { lead: toLeadResponse(lead) };
  }
}
