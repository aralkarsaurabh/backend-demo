import { Lead } from "../../../domain/entities/Lead";

export interface LeadResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: Lead["source"];
  status: Lead["status"];
  assignedToUserId: string | null;
  notes: string | null;
  convertedAt: string | null;
  convertedCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Never includes `organizationId`: the client already has it in the URL. */
export const toLeadResponse = (lead: Lead): LeadResponse => ({
  id: lead.id,
  name: lead.name,
  email: lead.email,
  phone: lead.phone,
  company: lead.company,
  source: lead.source,
  status: lead.status,
  assignedToUserId: lead.assignedToUserId,
  notes: lead.notes,
  convertedAt: lead.convertedAt?.toISOString() ?? null,
  convertedCustomerId: lead.convertedCustomerId,
  createdAt: lead.createdAt.toISOString(),
  updatedAt: lead.updatedAt.toISOString(),
});

/** A list item leaves out the free-text notes. */
export type LeadListItemResponse = Omit<LeadResponse, "notes">;

export const toLeadListItem = (lead: Lead): LeadListItemResponse => {
  const { notes: _notes, ...item } = toLeadResponse(lead);
  return item;
};
