import { PipelineWithStages } from "../entities/Pipeline";

export interface CreatePipelineData {
  name: string;
  description?: string;
}

/** A field left out is unchanged; `null` clears the description. */
export interface UpdatePipelineData {
  name?: string;
  description?: string | null;
}

export interface PipelineSummary {
  pipeline: { id: string; name: string };
  /** Every stage of the pipeline in position order, with 0 for an empty one. */
  stages: Array<{ id: string; name: string; position: number; leadCount: number }>;
  totalLeads: number;
}

/**
 * Every method takes the organization id, so a query can never reach another organization's
 * pipelines (decision D34).
 */
export interface PipelineRepository {
  /** Throws PIPELINE_ALREADY_EXISTS when the organization already has a pipeline with this name (D40). */
  create(organizationId: string, data: CreatePipelineData): Promise<PipelineWithStages>;

  /** Null when there is no such pipeline in this organization. */
  findById(organizationId: string, pipelineId: string): Promise<PipelineWithStages | null>;

  /** The organization's pipelines, oldest first, each with its stages in position order. */
  findMany(organizationId: string): Promise<PipelineWithStages[]>;

  /**
   * Null, changing nothing, when there is no such pipeline in this organization. Throws
   * PIPELINE_ALREADY_EXISTS when the new name is taken.
   */
  update(organizationId: string, pipelineId: string, data: UpdatePipelineData): Promise<PipelineWithStages | null>;

  /**
   * True if a pipeline was deleted; false, changing nothing, if none matched. Throws
   * PIPELINE_NOT_EMPTY while the pipeline still has stages (D41). The check and the delete are
   * atomic.
   */
  delete(organizationId: string, pipelineId: string): Promise<boolean>;

  /** Lead counts per stage, calculated by the database (D43). Null when there is no such pipeline. */
  getSummary(organizationId: string, pipelineId: string): Promise<PipelineSummary | null>;
}
