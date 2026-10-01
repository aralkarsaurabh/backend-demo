import { Request, Response } from "express";
import {
  acceptInvitationRequestSchema,
  createOrganizationRequestSchema,
  inviteMemberRequestSchema,
  memberParamsSchema,
  updateMemberRoleRequestSchema,
} from "../../../application/dto/organization/OrganizationRequests";
import { AcceptOrganizationInvitation } from "../../../application/use-cases/organization/AcceptOrganizationInvitation";
import { CreateOrganization } from "../../../application/use-cases/organization/CreateOrganization";
import { GetOrganization } from "../../../application/use-cases/organization/GetOrganization";
import { InviteOrganizationMember } from "../../../application/use-cases/organization/InviteOrganizationMember";
import { ListOrganizationMembers } from "../../../application/use-cases/organization/ListOrganizationMembers";
import { ListUserOrganizations } from "../../../application/use-cases/organization/ListUserOrganizations";
import { RemoveOrganizationMember } from "../../../application/use-cases/organization/RemoveOrganizationMember";
import { UpdateOrganizationMemberRole } from "../../../application/use-cases/organization/UpdateOrganizationMemberRole";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface OrganizationUseCases {
  createOrganization: CreateOrganization;
  listUserOrganizations: ListUserOrganizations;
  getOrganization: GetOrganization;
  inviteOrganizationMember: InviteOrganizationMember;
  acceptOrganizationInvitation: AcceptOrganizationInvitation;
  listOrganizationMembers: ListOrganizationMembers;
  updateOrganizationMemberRole: UpdateOrganizationMemberRole;
  removeOrganizationMember: RemoveOrganizationMember;
}

const currentUser = (req: Request) => {
  if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
  return req.user;
};

/** Set by requireOrganizationMembership; every :organizationId route runs it first. */
const currentMembership = (req: Request) => {
  if (!req.organizationMembership) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);
  return req.organizationMembership;
};

// Logs never include invitation tokens (or their hashes), only ids and codes.
export class OrganizationController {
  constructor(
    private readonly useCases: OrganizationUseCases,
    private readonly logger: Logger,
  ) {}

  create = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = parseOrThrow(createOrganizationRequestSchema, req.body ?? {});
    const result = await this.useCases.createOrganization.execute(body, user.id);

    this.logger.info("organization_created", {
      userId: user.id,
      organizationId: result.organization.id,
    });
    res.status(201).json(ApiResponse.success("Organization created successfully.", result));
  };

  list = async (req: Request, res: Response) => {
    const result = await this.useCases.listUserOrganizations.execute(currentUser(req).id);
    res.status(200).json(ApiResponse.success("Organizations retrieved successfully.", result));
  };

  get = async (req: Request, res: Response) => {
    const { organizationId, role } = currentMembership(req);
    const result = await this.useCases.getOrganization.execute(organizationId, role);
    res.status(200).json(ApiResponse.success("Organization retrieved successfully.", result));
  };

  invite = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId, role: actorRole } = currentMembership(req);
    const body = parseOrThrow(inviteMemberRequestSchema, req.body ?? {});

    const result = await this.useCases.inviteOrganizationMember.execute({
      organizationId,
      actorRole,
      invitedBy: user.id,
      email: body.email,
      role: body.role,
    });

    this.logger.info("member_invited", {
      userId: user.id,
      organizationId,
      invitationId: result.invitation.id,
      role: result.invitation.role,
    });
    res.status(201).json(ApiResponse.success("Invitation created successfully.", result));
  };

  listMembers = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const result = await this.useCases.listOrganizationMembers.execute(organizationId);
    res.status(200).json(ApiResponse.success("Members retrieved successfully.", result));
  };

  updateMemberRole = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { userId } = parseOrThrow(memberParamsSchema, req.params);
    const body = parseOrThrow(updateMemberRoleRequestSchema, req.body ?? {});

    const { member, previousRole } = await this.useCases.updateOrganizationMemberRole.execute({
      organizationId,
      targetUserId: userId,
      role: body.role,
    });

    this.logger.info("member_role_changed", {
      userId: user.id,
      organizationId,
      targetUserId: userId,
      oldRole: previousRole,
      newRole: member.role,
    });
    res.status(200).json(ApiResponse.success("Member role updated successfully.", { member }));
  };

  removeMember = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId, role: actorRole } = currentMembership(req);
    const { userId } = parseOrThrow(memberParamsSchema, req.params);

    const { removedRole } = await this.useCases.removeOrganizationMember.execute({
      organizationId,
      actorRole,
      targetUserId: userId,
    });

    this.logger.info("member_removed", {
      userId: user.id,
      organizationId,
      targetUserId: userId,
      removedRole,
    });
    res.status(200).json(ApiResponse.success("Member removed successfully.", null));
  };

  acceptInvitation = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = parseOrThrow(acceptInvitationRequestSchema, req.body ?? {});

    let result;
    try {
      result = await this.useCases.acceptOrganizationInvitation.execute({
        token: body.token,
        userId: user.id,
      });
    } catch (error) {
      if (error instanceof AppError) {
        this.logger.info("invitation_accept_failed", { userId: user.id, reason: error.code });
      }
      throw error;
    }

    this.logger.info("invitation_accepted", {
      userId: user.id,
      organizationId: result.organization.id,
      role: result.role,
    });
    res.status(200).json(ApiResponse.success("Invitation accepted successfully.", result));
  };
}
