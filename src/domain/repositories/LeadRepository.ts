import { Customer } from "../entities/Customer";
import { Lead, LeadSource, LeadStatus, LeadUpdatableStatus } from "../entities/Lead";
import { SortOrder } from "./CustomerRepository";

export interface CreateLeadData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: LeadSource;
  notes?: string;
}

/** A field left out is unchanged; `null` clears an optional field or unassigns the lead. */
export interface UpdateLeadData {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: LeadSource | null;
  status?: LeadUpdatableStatus;
  assignedToUserId?: string | null;
  notes?: string | null;
}

/** The only fields a list may be sorted by. Anything else is rejected before the database. */
export const LEAD_SORT_FIELDS = ["createdAt", "name", "company"] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export interface LeadListQuery {
  /** 1-based. */
  page: number;
  limit: number;
  /** Substring of name, email, phone or company, ignoring case. */
  search?: string;
  status?: LeadStatus;
  source?: LeadSource;
  assignedToUserId?: string;
  /** Inclusive bounds on createdAt. */
  createdFrom?: Date;
  createdTo?: Date;
  sortBy: LeadSortField;
  sortOrder: SortOrder;
}

export interface LeadPage {
  items: Lead[];
  /** Every lead matching the filters, not just this page. */
  totalItems: number;
}

export interface ConvertedLead {
  lead: Lead;
  customer: Customer;
}

/**
 * Every method takes the organization id, so a query can never reach another
 * organization's leads (decision D24).
 */
export interface LeadRepository {
  create(organizationId: string, data: CreateLeadData): Promise<Lead>;

  /** Null when there is no such lead in this organization. */
  findById(organizationId: string, leadId: string): Promise<Lead | null>;

  /**
   * Null, changing nothing, when there is no such lead in this organization or the lead is
   * already converted (D31).
   */
  update(organizationId: string, leadId: string, data: UpdateLeadData): Promise<Lead | null>;

  /** True if a lead was deleted; false, changing nothing, if none matched. */
  delete(organizationId: string, leadId: string): Promise<boolean>;

  /** One page of the organization's leads, in a total order that always ends in `id`. */
  list(organizationId: string, query: LeadListQuery): Promise<LeadPage>;

  /**
   * Atomically creates a customer from the lead and marks the lead converted (D30).
   * Null when there is no such lead in this organization; throws LEAD_ALREADY_CONVERTED,
   * leaving no customer behind, when it was converted first.
   */
  convert(organizationId: string, leadId: string): Promise<ConvertedLead | null>;

  /**
   * Puts the lead in the stage and changes nothing else (D35). Null, changing nothing, when there
   * is no such lead in this organization, the lead is already converted (D42), or the stage is not
   * a stage of one of this organization's pipelines (D34). Throws PIPELINE_STAGE_NOT_FOUND when
   * the stage is deleted while the move is running.
   */
  moveToStage(organizationId: string, leadId: string, stageId: string): Promise<Lead | null>;
}
