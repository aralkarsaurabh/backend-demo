import { z } from "zod";
import { text } from "../customer/CustomerRequests";
import { organizationParamsSchema } from "../organization/OrganizationRequests";

export const PIPELINE_NAME_MAX_LENGTH = 100;
export const PIPELINE_DESCRIPTION_MAX_LENGTH = 500;
export const PIPELINE_REORDER_MAX_STAGES = 100;

const nameField = text("Name", PIPELINE_NAME_MAX_LENGTH);
const descriptionField = text("Description", PIPELINE_DESCRIPTION_MAX_LENGTH);

/**
 * Strict: the organization id comes from the URL and membership, never the body, and the id,
 * the stages and the timestamps belong to the server.
 */
export const createPipelineRequestSchema = z.strictObject({
  name: nameField,
  description: descriptionField.optional(),
});

/** At least one field; `null` clears the description. */
export const updatePipelineRequestSchema = z
  .strictObject({
    name: nameField.optional(),
    description: descriptionField.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Send at least one field to update.",
  });

/** Only a name: a position is never accepted, the server assigns it (D37). */
export const createStageRequestSchema = z.strictObject({ name: nameField });

/** Renaming only. Positions change through the reorder endpoint. */
export const updateStageRequestSchema = z.strictObject({ name: nameField });

/** The full new order. The use case and repository check that it is exactly the pipeline's stages (D38). */
export const reorderStagesRequestSchema = z.strictObject({
  stageIds: z
    .array(z.uuid({ error: "Stage ids must be valid ids." }), { error: "Stage ids must be a list." })
    .min(1, "Send at least one stage id.")
    .max(PIPELINE_REORDER_MAX_STAGES, `Send at most ${PIPELINE_REORDER_MAX_STAGES} stage ids.`),
});

export const moveLeadRequestSchema = z.strictObject({
  pipelineStageId: z.uuid({ error: "Pipeline stage id must be a valid id." }),
});

export const pipelineParamsSchema = organizationParamsSchema.extend({
  pipelineId: z.uuid({ error: "Pipeline id must be a valid id." }),
});

export const stageParamsSchema = pipelineParamsSchema.extend({
  stageId: z.uuid({ error: "Stage id must be a valid id." }),
});

export type CreatePipelineRequest = z.output<typeof createPipelineRequestSchema>;
export type UpdatePipelineRequest = z.output<typeof updatePipelineRequestSchema>;
export type CreateStageRequest = z.output<typeof createStageRequestSchema>;
export type UpdateStageRequest = z.output<typeof updateStageRequestSchema>;
export type ReorderStagesRequest = z.output<typeof reorderStagesRequestSchema>;
export type MoveLeadRequest = z.output<typeof moveLeadRequestSchema>;
