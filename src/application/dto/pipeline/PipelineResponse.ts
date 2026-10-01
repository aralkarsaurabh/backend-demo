import { PipelineStage, PipelineWithStages } from "../../../domain/entities/Pipeline";
import { PipelineSummary } from "../../../domain/repositories/PipelineRepository";

export interface PipelineStageResponse {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineResponse {
  id: string;
  name: string;
  description: string | null;
  stages: PipelineStageResponse[];
  createdAt: string;
  updatedAt: string;
}

export const toPipelineStageResponse = (stage: PipelineStage): PipelineStageResponse => ({
  id: stage.id,
  pipelineId: stage.pipelineId,
  name: stage.name,
  position: stage.position,
  createdAt: stage.createdAt.toISOString(),
  updatedAt: stage.updatedAt.toISOString(),
});

/** Never includes `organizationId`: the client already has it in the URL. */
export const toPipelineResponse = (pipeline: PipelineWithStages): PipelineResponse => ({
  id: pipeline.id,
  name: pipeline.name,
  description: pipeline.description,
  stages: pipeline.stages.map(toPipelineStageResponse),
  createdAt: pipeline.createdAt.toISOString(),
  updatedAt: pipeline.updatedAt.toISOString(),
});

export type PipelineSummaryResponse = PipelineSummary;
