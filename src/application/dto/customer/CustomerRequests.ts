import { z } from "zod";
import { CUSTOMER_SORT_FIELDS } from "../../../domain/repositories/CustomerRepository";
import { organizationParamsSchema } from "../organization/OrganizationRequests";
import { emailField } from "../auth/RegisterRequest";

export const CUSTOMER_NAME_MAX_LENGTH = 100;
export const CUSTOMER_PHONE_MAX_LENGTH = 30;
export const CUSTOMER_COMPANY_MAX_LENGTH = 150;
export const CUSTOMER_NOTES_MAX_LENGTH = 1000;

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .min(1, `${label} must not be empty.`)
    .max(max, `${label} must be at most ${max} characters.`);

const nameField = z
  .string({ error: "Name is required." })
  .trim()
  .transform((name) => name.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Name is required.")
      .max(CUSTOMER_NAME_MAX_LENGTH, `Name must be at most ${CUSTOMER_NAME_MAX_LENGTH} characters.`),
  );

/**
 * Strict: the organization id comes from the URL and membership, never the body, and
 * `id`, `createdAt` and `updatedAt` belong to the server. Any other key is rejected.
 */
export const createCustomerRequestSchema = z.strictObject({
  name: nameField,
  email: emailField.optional(),
  phone: text("Phone", CUSTOMER_PHONE_MAX_LENGTH).optional(),
  company: text("Company", CUSTOMER_COMPANY_MAX_LENGTH).optional(),
  notes: text("Notes", CUSTOMER_NOTES_MAX_LENGTH).optional(),
});

export const customerParamsSchema = organizationParamsSchema.extend({
  customerId: z.uuid({ error: "Customer id must be a valid id." }),
});

export const CUSTOMER_LIST_DEFAULT_LIMIT = 20;
export const CUSTOMER_LIST_MAX_LIMIT = 100;
export const CUSTOMER_SEARCH_MAX_LENGTH = 100;

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`);

/** Query strings arrive as text: numbers are coerced, and only whitelisted sort fields pass. */
export const customerListQuerySchema = z
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
    company: text("Company", CUSTOMER_COMPANY_MAX_LENGTH).optional(),
    createdFrom: z.iso
      .date({ error: "Created from must be a date like 2026-09-01." })
      .transform(startOfDay)
      .optional(),
    createdTo: z.iso
      .date({ error: "Created to must be a date like 2026-09-30." })
      .transform(endOfDay)
      .optional(),
    sortBy: z
      .enum(CUSTOMER_SORT_FIELDS, { error: `Sort by must be one of: ${CUSTOMER_SORT_FIELDS.join(", ")}.` })
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"], { error: "Sort order must be asc or desc." }).default("desc"),
  })
  .refine(
    (query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo,
    { path: ["createdFrom"], message: "Created from must not be after created to." },
  );

export type CreateCustomerRequest = z.output<typeof createCustomerRequestSchema>;
export type ListCustomersRequest = z.output<typeof customerListQuerySchema>;
