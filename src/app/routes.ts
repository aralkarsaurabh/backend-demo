import { Router } from "express";
import { UserRole } from "../domain/enums/UserRole";
import { OrganizationPermission } from "../domain/policies/OrganizationPermissions";
import { AuthController } from "../infrastructure/http/controllers/AuthController";
import { HealthController } from "../infrastructure/http/controllers/HealthController";
import { OrganizationController } from "../infrastructure/http/controllers/OrganizationController";
import { UserController } from "../infrastructure/http/controllers/UserController";
import { Logger } from "../shared/logger";
import { Container } from "./container";
import { authenticate } from "./middleware/auth.middleware";
import {
  requireOrganizationMembership,
  requireOrganizationPermission,
} from "./middleware/organization.middleware";
import { authorize } from "./middleware/role.middleware";

export function createRoutes(container: Container, logger: Logger): Router {
  const auth = new AuthController(container, logger);
  const users = new UserController(container.getCurrentUser, container.listUsers);
  const organizations = new OrganizationController(container, logger);
  const health = new HealthController();
  const requireAuth = authenticate(container.tokens);
  const requireMembership = requireOrganizationMembership(container.organizationMemberships);

  const router = Router();

  router.get("/health", health.check);

  router.post("/auth/register", auth.register);
  router.post("/auth/login", auth.login);
  router.post("/auth/refresh", auth.refresh);
  router.post("/auth/logout", auth.logout);

  router.get("/users/me", requireAuth, users.me);
  router.get("/admin/users", requireAuth, authorize(UserRole.ADMIN), users.list);

  // Organizations. Platform roles play no part here: access comes from the caller's
  // membership, looked up per request, and the :organizationId in the path is untrusted.
  router.post("/organizations", requireAuth, organizations.create);
  router.get("/organizations", requireAuth, organizations.list);
  router.post("/organization-invitations/accept", requireAuth, organizations.acceptInvitation);

  router.get(
    "/organizations/:organizationId",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.ORGANIZATION_READ),
    organizations.get,
  );
  router.post(
    "/organizations/:organizationId/invitations",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.MEMBER_INVITE),
    organizations.invite,
  );
  router.get(
    "/organizations/:organizationId/members",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.MEMBER_READ),
    organizations.listMembers,
  );
  router.patch(
    "/organizations/:organizationId/members/:userId",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.MEMBER_UPDATE_ROLE),
    organizations.updateMemberRole,
  );
  router.delete(
    "/organizations/:organizationId/members/:userId",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.MEMBER_REMOVE),
    organizations.removeMember,
  );

  return router;
}
