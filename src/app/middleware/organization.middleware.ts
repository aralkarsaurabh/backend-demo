import { RequestHandler } from "express";
import { organizationParamsSchema } from "../../application/dto/organization/OrganizationRequests";
import {
  OrganizationPermission,
  hasPermission,
} from "../../domain/policies/OrganizationPermissions";
import { OrganizationMembershipRepository } from "../../domain/repositories/OrganizationMembershipRepository";
import { AppError } from "../../shared/errors/AppError";
import { ErrorCode } from "../../shared/errors/error-codes";
import { parseOrThrow } from "../../shared/validation/parse";

/**
 * Must run after `authenticate`. The `:organizationId` in the path is untrusted:
 * this looks up the caller's membership in the database on every request (decision
 * D5) and attaches it as `req.organizationMembership`. A non-member gets
 * ORGANIZATION_NOT_FOUND, exactly as for an organization that does not exist (D9).
 */
export function requireOrganizationMembership(
  memberships: OrganizationMembershipRepository,
): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);

    const { organizationId } = parseOrThrow(organizationParamsSchema, req.params);
    const membership = await memberships.findByOrganizationAndUser(organizationId, req.user.id);
    if (!membership) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);

    req.organizationMembership = { organizationId, role: membership.role };
    next();
  };
}

/** Must run after `requireOrganizationMembership`. */
export function requireOrganizationPermission(permission: OrganizationPermission): RequestHandler {
  return (req, _res, next) => {
    if (!req.organizationMembership) throw new AppError(ErrorCode.UNAUTHORIZED);
    if (!hasPermission(req.organizationMembership.role, permission)) {
      throw new AppError(ErrorCode.INSUFFICIENT_ORGANIZATION_PERMISSION);
    }
    next();
  };
}
