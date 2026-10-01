import { Request, Response } from "express";
import { leadParamsSchema } from "../../../application/dto/lead/LeadRequests";
import {
  createPipelineRequestSchema,
  createStageRequestSchema,
  moveLeadRequestSchema,
  pipelineParamsSchema,
  reorderStagesRequestSchema,
  stageParamsSchema,
  updatePipelineRequestSchema,
  updateStageRequestSchema,
} from "../../../application/dto/pipeline/PipelineRequests";
import { CreatePipeline } from "../../../application/use-cases/pipeline/CreatePipeline";
import { CreatePipelineStage } from "../../../application/use-cases/pipeline/CreatePipelineStage";
import { DeletePipeline } from "../../../application/use-cases/pipeline/DeletePipeline";
import { DeletePipelineStage } from "../../../application/use-cases/pipeline/DeletePipelineStage";
import { GetPipeline } from "../../../application/use-cases/pipeline/GetPipeline";
import { GetPipelineSummary } from "../../../application/use-cases/pipeline/GetPipelineSummary";
import { ListPipelines } from "../../../application/use-cases/pipeline/ListPipelines";
import { MoveLeadToStage } from "../../../application/use-cases/pipeline/MoveLeadToStage";
import { ReorderPipelineStages } from "../../../application/use-cases/pipeline/ReorderPipelineStages";
import { UpdatePipeline } from "../../../application/use-cases/pipeline/UpdatePipeline";
import { UpdatePipelineStage } from "../../../application/use-cases/pipeline/UpdatePipelineStage";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface PipelineUseCases {
  createPipeline: CreatePipeline;
  listPipelines: ListPipelines;
  getPipeline: GetPipeline;
  updatePipeline: UpdatePipeline;
  deletePipeline: DeletePipeline;
  createPipelineStage: CreatePipelineStage;
  updatePipelineStage: UpdatePipelineStage;
  deletePipelineStage: DeletePipelineStage;
  reorderPipelineStages: ReorderPipelineStages;
  moveLeadToStage: MoveLeadToStage;
  getPipelineSummary: GetPipelineSummary;
}

const currentUser = (req: Request) => {
  if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
  return req.user;
};

/** Set by requireOrganizationMembership; every pipeline route runs it first. */
const currentMembership = (req: Request) => {
  if (!req.organizationMembership) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);
  return req.organizationMembership;
};

// Logs carry ids only, never a pipeline or stage name or description.
export class PipelineController {
  constructor(
    private readonly useCases: PipelineUseCases,
    private readonly logger: Logger,
  ) {}

  create = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const body = parseOrThrow(createPipelineRequestSchema, req.body ?? {});
    const result = await this.useCases.createPipeline.execute(organizationId, body);

    this.logger.info("pipeline_created", { userId: user.id, organizationId, pipelineId: result.pipeline.id });
    res.status(201).json(ApiResponse.success("Pipeline created successfully.", result));
  };

  list = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const result = await this.useCases.listPipelines.execute(organizationId);
    res.status(200).json(ApiResponse.success("Pipelines retrieved successfully.", result));
  };

  get = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const { pipelineId } = parseOrThrow(pipelineParamsSchema, req.params);
    const result = await this.useCases.getPipeline.execute(organizationId, pipelineId);
    res.status(200).json(ApiResponse.success("Pipeline retrieved successfully.", result));
  };

  update = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { pipelineId } = parseOrThrow(pipelineParamsSchema, req.params);
    const body = parseOrThrow(updatePipelineRequestSchema, req.body ?? {});
    const result = await this.useCases.updatePipeline.execute(organizationId, pipelineId, body);

    this.logger.info("pipeline_updated", { userId: user.id, organizationId, pipelineId });
    res.status(200).json(ApiResponse.success("Pipeline updated successfully.", result));
  };

  remove = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { pipelineId } = parseOrThrow(pipelineParamsSchema, req.params);
    await this.useCases.deletePipeline.execute(organizationId, pipelineId);

    this.logger.info("pipeline_deleted", { userId: user.id, organizationId, pipelineId });
    res.status(200).json(ApiResponse.success("Pipeline deleted successfully.", null));
  };

  createStage = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { pipelineId } = parseOrThrow(pipelineParamsSchema, req.params);
    const body = parseOrThrow(createStageRequestSchema, req.body ?? {});
    const result = await this.useCases.createPipelineStage.execute(organizationId, pipelineId, body);

    this.logger.info("pipeline_stage_created", {
      userId: user.id,
      organizationId,
      pipelineId,
      stageId: result.stage.id,
    });
    res.status(201).json(ApiResponse.success("Stage created successfully.", result));
  };

  updateStage = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { pipelineId, stageId } = parseOrThrow(stageParamsSchema, req.params);
    const body = parseOrThrow(updateStageRequestSchema, req.body ?? {});
    const result = await this.useCases.updatePipelineStage.execute(organizationId, pipelineId, stageId, body);

    this.logger.info("pipeline_stage_updated", { userId: user.id, organizationId, pipelineId, stageId });
    res.status(200).json(ApiResponse.success("Stage updated successfully.", result));
  };

  removeStage = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { pipelineId, stageId } = parseOrThrow(stageParamsSchema, req.params);
    await this.useCases.deletePipelineStage.execute(organizationId, pipelineId, stageId);

    this.logger.info("pipeline_stage_deleted", { userId: user.id, organizationId, pipelineId, stageId });
    res.status(200).json(ApiResponse.success("Stage deleted successfully.", null));
  };

  reorderStages = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { pipelineId } = parseOrThrow(pipelineParamsSchema, req.params);
    const body = parseOrThrow(reorderStagesRequestSchema, req.body ?? {});
    const result = await this.useCases.reorderPipelineStages.execute(organizationId, pipelineId, body);

    this.logger.info("pipeline_stages_reordered", {
      userId: user.id,
      organizationId,
      pipelineId,
      stageCount: body.stageIds.length,
    });
    res.status(200).json(ApiResponse.success("Stages reordered successfully.", result));
  };

  moveLead = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { leadId } = parseOrThrow(leadParamsSchema, req.params);
    const body = parseOrThrow(moveLeadRequestSchema, req.body ?? {});
    const result = await this.useCases.moveLeadToStage.execute(organizationId, leadId, body);

    this.logger.info("lead_moved_to_stage", {
      userId: user.id,
      organizationId,
      leadId,
      stageId: body.pipelineStageId,
    });
    res.status(200).json(ApiResponse.success("Lead moved successfully.", result));
  };

  summary = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const { pipelineId } = parseOrThrow(pipelineParamsSchema, req.params);
    const result = await this.useCases.getPipelineSummary.execute(organizationId, pipelineId);
    res.status(200).json(ApiResponse.success("Pipeline summary retrieved successfully.", result));
  };
}
