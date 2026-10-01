export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  /** 0-based and contiguous within the pipeline. Assigned by the server, never by a client (D37). */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pipeline {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A pipeline with its stages, always ordered by position. */
export interface PipelineWithStages extends Pipeline {
  stages: PipelineStage[];
}
