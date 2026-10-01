import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { PipelineStageRepository } from "../../../domain/repositories/PipelineStageRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdateStageRequest } from "../../dto/pipeline/PipelineRequests";
import { PipelineStageResponse, toPipelineStageResponse } from "../../dto/pipeline/PipelineResponse";

export class UpdatePipelineStage {
  constructor(
    private readonly pipelines: PipelineRepository,
    private readonly stages: PipelineStageRepository,
  ) {}

  async execute(
    organizationId: string,
    pipelineId: string,
    stageId: string,
    request: UpdateStageRequest,
  ): Promise<{ stage: PipelineStageResponse }> {
    if (!(await this.pipelines.findById(organizationId, pipelineId))) {
      throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
    }
    const stage = await this.stages.update(organizationId, pipelineId, stageId, request);
    if (!stage) throw new AppError(ErrorCode.PIPELINE_STAGE_NOT_FOUND);
    return { stage: toPipelineStageResponse(stage) };
  }
}
