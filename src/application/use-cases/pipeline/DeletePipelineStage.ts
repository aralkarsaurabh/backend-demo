import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { PipelineStageRepository } from "../../../domain/repositories/PipelineStageRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export class DeletePipelineStage {
  constructor(
    private readonly pipelines: PipelineRepository,
    private readonly stages: PipelineStageRepository,
  ) {}

  /** Hard delete (D44). The repository refuses with PIPELINE_STAGE_IN_USE while a lead is in the stage (D41). */
  async execute(organizationId: string, pipelineId: string, stageId: string): Promise<void> {
    if (!(await this.pipelines.findById(organizationId, pipelineId))) {
      throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
    }
    const deleted = await this.stages.delete(organizationId, pipelineId, stageId);
    if (!deleted) throw new AppError(ErrorCode.PIPELINE_STAGE_NOT_FOUND);
  }
}
