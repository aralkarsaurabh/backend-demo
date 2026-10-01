export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "UNQUALIFIED",
  "CONVERTED",
  "LOST",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** `CONVERTED` is only ever set by converting the lead, never by an update (D30). */
export const LEAD_UPDATABLE_STATUSES = LEAD_STATUSES.filter(
  (status): status is Exclude<LeadStatus, "CONVERTED"> => status !== "CONVERTED",
);
export type LeadUpdatableStatus = (typeof LEAD_UPDATABLE_STATUSES)[number];

export const LEAD_SOURCES = [
  "WEBSITE",
  "REFERRAL",
  "SOCIAL_MEDIA",
  "EMAIL_CAMPAIGN",
  "COLD_OUTREACH",
  "EVENT",
  "OTHER",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: LeadSource | null;
  status: LeadStatus;
  assignedToUserId: string | null;
  notes: string | null;
  convertedAt: Date | null;
  convertedCustomerId: string | null;
  /** The lead's position in a sales pipeline; set only by moving it, never by an update (D35, D36). */
  pipelineStageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
