import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { toPaginationResponse, PaginationResponse } from "../../dto/customer/CustomerResponse";
import { ListLeadsRequest } from "../../dto/lead/LeadRequests";
import { LeadListItemResponse, toLeadListItem } from "../../dto/lead/LeadResponse";

export class ListLeads {
  constructor(private readonly leads: LeadRepository) {}

  async execute(
    organizationId: string,
    query: ListLeadsRequest,
  ): Promise<{ leads: LeadListItemResponse[]; pagination: PaginationResponse }> {
    const { items, totalItems } = await this.leads.list(organizationId, query);
    return {
      leads: items.map(toLeadListItem),
      pagination: toPaginationResponse(query.page, query.limit, totalItems),
    };
  }
}
