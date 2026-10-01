import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { CreatePipelineRequest } from "../../dto/pipeline/PipelineRequests";
import { PipelineResponse, toPipelineResponse } from "../../dto/pipeline/PipelineResponse";

export class CreatePipeline {
  constructor(private readonly pipelines: PipelineRepository) {}

  /** `organizationId` is the caller's verified organization, never a body field. */
  async execute(organizationId: string, request: CreatePipelineRequest): Promise<{ pipeline: PipelineResponse }> {
    const pipeline = await this.pipelines.create(organizationId, request);
    return { pipeline: toPipelineResponse(pipeline) };
  }
}
