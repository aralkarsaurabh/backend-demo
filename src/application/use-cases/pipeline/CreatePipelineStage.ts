import { PipelineStageRepository } from "../../../domain/repositories/PipelineStageRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { CreateStageRequest } from "../../dto/pipeline/PipelineRequests";
import { PipelineStageResponse, toPipelineStageResponse } from "../../dto/pipeline/PipelineResponse";

export class CreatePipelineStage {
  constructor(private readonly stages: PipelineStageRepository) {}

  /** The position is assigned by the repository (D37): the request carries only a name. */
  async execute(
    organizationId: string,
    pipelineId: string,
    request: CreateStageRequest,
  ): Promise<{ stage: PipelineStageResponse }> {
    const stage = await this.stages.create(organizationId, pipelineId, request);
    if (!stage) throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
    return { stage: toPipelineStageResponse(stage) };
  }
}
