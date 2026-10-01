import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { PipelineStageRepository } from "../../../domain/repositories/PipelineStageRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { ReorderStagesRequest } from "../../dto/pipeline/PipelineRequests";
import { PipelineResponse, toPipelineResponse } from "../../dto/pipeline/PipelineResponse";

export class ReorderPipelineStages {
  constructor(
    private readonly pipelines: PipelineRepository,
    private readonly stages: PipelineStageRepository,
  ) {}

  /** The whole reorder is one atomic repository call (D38); this returns the pipeline in its new order. */
  async execute(
    organizationId: string,
    pipelineId: string,
    request: ReorderStagesRequest,
  ): Promise<{ pipeline: PipelineResponse }> {
    const reordered = await this.stages.reorder(organizationId, pipelineId, request.stageIds);
    if (!reordered) throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);

    const pipeline = await this.pipelines.findById(organizationId, pipelineId);
    if (!pipeline) throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
    return { pipeline: toPipelineResponse(pipeline) };
  }
}
