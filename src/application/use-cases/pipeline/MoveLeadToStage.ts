import { LeadRepository } from "../../../domain/repositories/LeadRepository";
import { PipelineStageRepository } from "../../../domain/repositories/PipelineStageRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { LeadResponse, toLeadResponse } from "../../dto/lead/LeadResponse";
import { MoveLeadRequest } from "../../dto/pipeline/PipelineRequests";

export class MoveLeadToStage {
  constructor(
    private readonly leads: LeadRepository,
    private readonly stages: PipelineStageRepository,
  ) {}

  /**
   * The stage must belong to a pipeline of the same organization as the lead (D34, D42); a stage of
   * another organization is PIPELINE_STAGE_NOT_FOUND. `Lead.status` is never touched (D35).
   */
  async execute(organizationId: string, leadId: string, request: MoveLeadRequest): Promise<{ lead: LeadResponse }> {
    const stage = await this.stages.findById(organizationId, request.pipelineStageId);
    if (!stage) throw new AppError(ErrorCode.PIPELINE_STAGE_NOT_FOUND);

    const lead = await this.leads.moveToStage(organizationId, leadId, stage.id);
    if (!lead) {
      // The guarded update matched nothing: no such lead, or it is (or just became) converted.
      const current = await this.leads.findById(organizationId, leadId);
      throw new AppError(current ? ErrorCode.LEAD_ALREADY_CONVERTED : ErrorCode.LEAD_NOT_FOUND);
    }
    return { lead: toLeadResponse(lead) };
  }
}
