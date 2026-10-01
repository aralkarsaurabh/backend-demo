import { PipelineStage } from "../entities/Pipeline";

export interface CreatePipelineStageData {
  name: string;
}

export interface UpdatePipelineStageData {
  name: string;
}

/**
 * Every method takes the organization id (and the pipeline id where the stage is addressed
 * through its pipeline), so a query can never reach another organization's stages (decision D34).
 */
export interface PipelineStageRepository {
  /**
   * Appends the stage at the next position (D37, D39). Null, creating nothing, when there is no
   * such pipeline in this organization. Throws PIPELINE_STAGE_ALREADY_EXISTS for a taken name.
   */
  create(organizationId: string, pipelineId: string, data: CreatePipelineStageData): Promise<PipelineStage | null>;

  /** A stage of any pipeline of this organization; null for any other stage. */
  findById(organizationId: string, stageId: string): Promise<PipelineStage | null>;

  /**
   * Renames. Null, changing nothing, when the stage is not in this pipeline of this organization.
   * Throws PIPELINE_STAGE_ALREADY_EXISTS for a taken name.
   */
  update(
    organizationId: string,
    pipelineId: string,
    stageId: string,
    data: UpdatePipelineStageData,
  ): Promise<PipelineStage | null>;

  /**
   * True if the stage was deleted and the later positions closed up; false, changing nothing, if
   * none matched. Throws PIPELINE_STAGE_IN_USE while a lead is in the stage (D41).
   */
  delete(organizationId: string, pipelineId: string, stageId: string): Promise<boolean>;

  /**
   * Rewrites the positions to the order of `stageIds` in one transaction (D38). False, changing
   * nothing, when there is no such pipeline in this organization. Throws INVALID_STAGE_ORDER, also
   * changing nothing, unless `stageIds` is exactly the pipeline's stages, each once.
   */
  reorder(organizationId: string, pipelineId: string, stageIds: string[]): Promise<boolean>;
}
