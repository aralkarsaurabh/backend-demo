import { z } from "zod";
import { LEAD_SOURCES, LEAD_STATUSES, LEAD_UPDATABLE_STATUSES } from "../../../domain/entities/Lead";
import { LEAD_SORT_FIELDS } from "../../../domain/repositories/LeadRepository";
import { emailField } from "../auth/RegisterRequest";
import {
  CUSTOMER_COMPANY_MAX_LENGTH,
  CUSTOMER_LIST_DEFAULT_LIMIT,
  CUSTOMER_LIST_MAX_LIMIT,
  CUSTOMER_NOTES_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  CUSTOMER_SEARCH_MAX_LENGTH,
  nameField,
  text,
} from "../customer/CustomerRequests";
import { organizationParamsSchema } from "../organization/OrganizationRequests";

// A lead becomes a customer, so its fields obey the customer limits: a lead can always be converted.
const sourceField = z.enum(LEAD_SOURCES, {
  error: `Source must be one of: ${LEAD_SOURCES.join(", ")}.`,
});

/**
 * Strict: the organization id comes from the URL and membership, never the body, and the
 * status, assignee, conversion fields and timestamps belong to the server (or to later calls).
 */
export const createLeadRequestSchema = z.strictObject({
  name: nameField,
  email: emailField.optional(),
  phone: text("Phone", CUSTOMER_PHONE_MAX_LENGTH).optional(),
  company: text("Company", CUSTOMER_COMPANY_MAX_LENGTH).optional(),
  source: sourceField.optional(),
  notes: text("Notes", CUSTOMER_NOTES_MAX_LENGTH).optional(),
});

/**
 * Every field is optional but at least one must be present, and `null` clears an optional one
 * or unassigns the lead. The status cannot be CONVERTED: only the convert endpoint sets it.
 */
export const updateLeadRequestSchema = z
  .strictObject({
    name: nameField.optional(),
    email: emailField.nullable().optional(),
    phone: text("Phone", CUSTOMER_PHONE_MAX_LENGTH).nullable().optional(),
    company: text("Company", CUSTOMER_COMPANY_MAX_LENGTH).nullable().optional(),
    source: sourceField.nullable().optional(),
    status: z
      .enum(LEAD_UPDATABLE_STATUSES, {
        error: `Status must be one of: ${LEAD_UPDATABLE_STATUSES.join(", ")}. Use the convert endpoint to convert a lead.`,
      })
      .optional(),
    assignedToUserId: z.uuid({ error: "Assigned user id must be a valid id." }).nullable().optional(),
    notes: text("Notes", CUSTOMER_NOTES_MAX_LENGTH).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Send at least one field to update.",
  });

/** A conversion takes no input: any body field is rejected. */
export const convertLeadRequestSchema = z.strictObject({});

export const leadParamsSchema = organizationParamsSchema.extend({
  leadId: z.uuid({ error: "Lead id must be a valid id." }),
});

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`);

/** Query strings arrive as text: numbers are coerced, and only whitelisted values pass. */
export const leadListQuerySchema = z
  .strictObject({
    page: z.coerce
      .number({ error: "Page must be a whole number." })
      .int("Page must be a whole number.")
      .min(1, "Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ error: "Limit must be a whole number." })
      .int("Limit must be a whole number.")
      .min(1, "Limit must be at least 1.")
      .max(CUSTOMER_LIST_MAX_LIMIT, `Limit must be at most ${CUSTOMER_LIST_MAX_LIMIT}.`)
      .default(CUSTOMER_LIST_DEFAULT_LIMIT),
    search: text("Search", CUSTOMER_SEARCH_MAX_LENGTH).optional(),
    status: z.enum(LEAD_STATUSES, { error: `Status must be one of: ${LEAD_STATUSES.join(", ")}.` }).optional(),
    source: sourceField.optional(),
    assignedToUserId: z.uuid({ error: "Assigned user id must be a valid id." }).optional(),
    createdFrom: z.iso
      .date({ error: "Created from must be a date like 2026-09-01." })
      .transform(startOfDay)
      .optional(),
    createdTo: z.iso
      .date({ error: "Created to must be a date like 2026-09-30." })
      .transform(endOfDay)
      .optional(),
    sortBy: z
      .enum(LEAD_SORT_FIELDS, { error: `Sort by must be one of: ${LEAD_SORT_FIELDS.join(", ")}.` })
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"], { error: "Sort order must be asc or desc." }).default("desc"),
  })
  .refine((query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo, {
    path: ["createdFrom"],
    message: "Created from must not be after created to.",
  });

export type CreateLeadRequest = z.output<typeof createLeadRequestSchema>;
export type UpdateLeadRequest = z.output<typeof updateLeadRequestSchema>;
export type ListLeadsRequest = z.output<typeof leadListQuerySchema>;
