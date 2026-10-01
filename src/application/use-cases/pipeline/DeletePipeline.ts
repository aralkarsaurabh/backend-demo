import { PipelineRepository } from "../../../domain/repositories/PipelineRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

export class DeletePipeline {
  constructor(private readonly pipelines: PipelineRepository) {}

  /**
   * Hard delete (D44). The repository refuses with PIPELINE_NOT_EMPTY while stages exist (D41),
   * so no lead can be left without its stage's pipeline.
   */
  async execute(organizationId: string, pipelineId: string): Promise<void> {
    const deleted = await this.pipelines.delete(organizationId, pipelineId);
    if (!deleted) throw new AppError(ErrorCode.PIPELINE_NOT_FOUND);
  }
}
