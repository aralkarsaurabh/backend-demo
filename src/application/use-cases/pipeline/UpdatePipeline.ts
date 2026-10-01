import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { UpdatePipelineRequest } from "../../dto/pipeline/PipelineRequests";
import { PipelineResponse, toPipelineResponse } from "../../dto/pipeline/PipelineResponse";

export class UpdatePipeline {
  constructor(private readonly pipelines: PipelineRepository) {}

  async execute(
    organizationId: string,
    pipelineId: string,
    request: UpdatePipelineRequest,
  ): Promise<{ pipeline: PipelineResponse }> {
    const pipeline = await this.pipelines.update(organizationId, pipelineId, request);
    if (!pipeline) throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
    return { pipeline: toPipelineResponse(pipeline) };
  }
}
