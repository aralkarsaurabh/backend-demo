import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { PipelineResponse, toPipelineResponse } from "../../dto/pipeline/PipelineResponse";

export class ListPipelines {
  constructor(private readonly pipelines: PipelineRepository) {}

  async execute(organizationId: string): Promise<{ pipelines: PipelineResponse[] }> {
    const pipelines = await this.pipelines.findMany(organizationId);
    return { pipelines: pipelines.map(toPipelineResponse) };
  }
}
