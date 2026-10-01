import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { PipelineSummaryResponse } from "../../dto/pipeline/PipelineResponse";

export class GetPipelineSummary {
  constructor(private readonly pipelines: PipelineRepository) {}

  /** The counts come from one database aggregation (D43); no lead is loaded into the application. */
  async execute(organizationId: string, pipelineId: string): Promise<PipelineSummaryResponse> {
    const summary = await this.pipelines.getSummary(organizationId, pipelineId);
    if (!summary) throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
    return summary;
  }
}
