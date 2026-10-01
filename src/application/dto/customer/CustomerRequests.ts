import { z } from "zod";
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

export type CreateCustomerRequest = z.output<typeof createCustomerRequestSchema>;
