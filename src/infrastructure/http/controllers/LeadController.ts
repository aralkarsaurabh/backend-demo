import { Request, Response } from "express";
import {
  convertLeadRequestSchema,
  createLeadRequestSchema,
  leadListQuerySchema,
  leadParamsSchema,
  updateLeadRequestSchema,
} from "../../../application/dto/lead/LeadRequests";
import { ConvertLead } from "../../../application/use-cases/lead/ConvertLead";
import { CreateLead } from "../../../application/use-cases/lead/CreateLead";
import { DeleteLead } from "../../../application/use-cases/lead/DeleteLead";
import { GetLead } from "../../../application/use-cases/lead/GetLead";
import { ListLeads } from "../../../application/use-cases/lead/ListLeads";
import { UpdateLead } from "../../../application/use-cases/lead/UpdateLead";
import {
  OrganizationPermission,
  hasPermission,
} from "../../../domain/policies/OrganizationPermissions";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface LeadUseCases {
  createLead: CreateLead;
  getLead: GetLead;
  listLeads: ListLeads;
  updateLead: UpdateLead;
  deleteLead: DeleteLead;
  convertLead: ConvertLead;
}

const currentUser = (req: Request) => {
  if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
  return req.user;
};

/** Set by requireOrganizationMembership; every lead route runs it first. */
const currentMembership = (req: Request) => {
  if (!req.organizationMembership) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);
  return req.organizationMembership;
};

// Logs carry ids only, never a lead's name, email, phone or notes.
export class LeadController {
  constructor(
    private readonly useCases: LeadUseCases,
    private readonly logger: Logger,
  ) {}

  create = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const body = parseOrThrow(createLeadRequestSchema, req.body ?? {});
    const result = await this.useCases.createLead.execute(organizationId, body);

    this.logger.info("lead_created", { userId: user.id, organizationId, leadId: result.lead.id });
    res.status(201).json(ApiResponse.success("Lead created successfully.", result));
  };

  list = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const query = parseOrThrow(leadListQuerySchema, req.query);
    const result = await this.useCases.listLeads.execute(organizationId, query);
    res.status(200).json(ApiResponse.success("Leads retrieved successfully.", result));
  };

  get = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const { leadId } = parseOrThrow(leadParamsSchema, req.params);
    const result = await this.useCases.getLead.execute(organizationId, leadId);
    res.status(200).json(ApiResponse.success("Lead retrieved successfully.", result));
  };

  update = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId, role } = currentMembership(req);
    const { leadId } = parseOrThrow(leadParamsSchema, req.params);
    const body = parseOrThrow(updateLeadRequestSchema, req.body ?? {});

    // Assigning is its own permission, so it depends on the body and cannot be a route guard.
    if (body.assignedToUserId !== undefined && !hasPermission(role, OrganizationPermission.LEAD_ASSIGN)) {
      throw new AppError(ErrorCode.INSUFFICIENT_ORGANIZATION_PERMISSION);
    }

    const result = await this.useCases.updateLead.execute(organizationId, leadId, body);

    this.logger.info("lead_updated", {
      userId: user.id,
      organizationId,
      leadId,
      // field names only, never the values
      changedFields: Object.keys(body)
        .filter((key) => body[key as keyof typeof body] !== undefined)
        .join(","),
    });
    res.status(200).json(ApiResponse.success("Lead updated successfully.", result));
  };

  remove = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { leadId } = parseOrThrow(leadParamsSchema, req.params);
    await this.useCases.deleteLead.execute(organizationId, leadId);

    this.logger.info("lead_deleted", { userId: user.id, organizationId, leadId });
    res.status(200).json(ApiResponse.success("Lead deleted successfully.", null));
  };

  convert = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { leadId } = parseOrThrow(leadParamsSchema, req.params);
    // The body must be empty: a conversion takes no input.
    parseOrThrow(convertLeadRequestSchema, req.body ?? {});
    const result = await this.useCases.convertLead.execute(organizationId, leadId);

    this.logger.info("lead_converted", {
      userId: user.id,
      organizationId,
      leadId,
      customerId: result.customer.id,
    });
    res.status(200).json(ApiResponse.success("Lead converted successfully.", result));
  };
}
