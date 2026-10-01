import { Router } from "express";
import { UserRole } from "../domain/enums/UserRole";
import { OrganizationPermission } from "../domain/policies/OrganizationPermissions";
import { AuthController } from "../infrastructure/http/controllers/AuthController";
import { CustomerController } from "../infrastructure/http/controllers/CustomerController";
import { LeadController } from "../infrastructure/http/controllers/LeadController";
import { HealthController } from "../infrastructure/http/controllers/HealthController";
import { OrganizationController } from "../infrastructure/http/controllers/OrganizationController";
import { PipelineController } from "../infrastructure/http/controllers/PipelineController";
import { TaskController } from "../infrastructure/http/controllers/TaskController";
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
  const users = new UserController(container, logger);
  const organizations = new OrganizationController(container, logger);
  const customers = new CustomerController(container, logger);
  const leads = new LeadController(container, logger);
  const pipelines = new PipelineController(container, logger);
  const tasks = new TaskController(container, logger);
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
  router.patch("/users/me", requireAuth, users.updateMe);
  router.post("/users/me/password", requireAuth, users.changePassword);
  router.patch("/users/:userId/status", requireAuth, authorize(UserRole.ADMIN), users.updateStatus);
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

  // Customers belong to one organization. The same membership lookup guards them, and the
  // organization id used by the use cases comes from that lookup, not from the body.
  router.post(
    "/organizations/:organizationId/customers",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.CUSTOMER_CREATE),
    customers.create,
  );
  router.get(
    "/organizations/:organizationId/customers",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.CUSTOMER_READ),
    customers.list,
  );
  router.get(
    "/organizations/:organizationId/customers/:customerId",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.CUSTOMER_READ),
    customers.get,
  );

  router.patch(
    "/organizations/:organizationId/customers/:customerId",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.CUSTOMER_UPDATE),
    customers.update,
  );

  router.delete(
    "/organizations/:organizationId/customers/:customerId",
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.CUSTOMER_DELETE),
    customers.remove,
  );

  // Leads belong to one organization, exactly like customers: the same membership lookup guards
  // them and the organization id used by the use cases comes from that lookup, not the body.
  // Assigning a lead (assignedToUserId in the PATCH body) additionally needs lead:assign, which
  // the controller checks because it depends on the body.
  const leadsPath = "/organizations/:organizationId/leads";
  router.post(
    leadsPath,
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.LEAD_CREATE),
    leads.create,
  );
  router.get(
    leadsPath,
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.LEAD_READ),
    leads.list,
  );
  router.get(
    `${leadsPath}/:leadId`,
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.LEAD_READ),
    leads.get,
  );
  router.patch(
    `${leadsPath}/:leadId`,
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.LEAD_UPDATE),
    leads.update,
  );
  router.delete(
    `${leadsPath}/:leadId`,
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.LEAD_DELETE),
    leads.remove,
  );
  router.post(
    `${leadsPath}/:leadId/convert`,
    requireAuth,
    requireMembership,
    requireOrganizationPermission(OrganizationPermission.LEAD_CONVERT),
    leads.convert,
  );

  // Pipelines belong to one organization, like leads. Defining them is for OWNER and ADMIN; every
  // member can read them and move leads through them. `stages/reorder` is registered before
  // `stages/:stageId` so "reorder" is never read as a stage id.
  const pipelinesPath = "/organizations/:organizationId/pipelines";
  const pipelinePath = `${pipelinesPath}/:pipelineId`;
  const guard = (permission: OrganizationPermission) =>
    [requireAuth, requireMembership, requireOrganizationPermission(permission)] as const;

  router.post(pipelinesPath, ...guard(OrganizationPermission.PIPELINE_CREATE), pipelines.create);
  router.get(pipelinesPath, ...guard(OrganizationPermission.PIPELINE_READ), pipelines.list);
  router.get(pipelinePath, ...guard(OrganizationPermission.PIPELINE_READ), pipelines.get);
  router.patch(pipelinePath, ...guard(OrganizationPermission.PIPELINE_UPDATE), pipelines.update);
  router.delete(pipelinePath, ...guard(OrganizationPermission.PIPELINE_DELETE), pipelines.remove);
  router.get(`${pipelinePath}/summary`, ...guard(OrganizationPermission.PIPELINE_READ), pipelines.summary);
  router.post(`${pipelinePath}/stages`, ...guard(OrganizationPermission.PIPELINE_MANAGE_STAGES), pipelines.createStage);
  router.patch(
    `${pipelinePath}/stages/reorder`,
    ...guard(OrganizationPermission.PIPELINE_MANAGE_STAGES),
    pipelines.reorderStages,
  );
  router.patch(
    `${pipelinePath}/stages/:stageId`,
    ...guard(OrganizationPermission.PIPELINE_MANAGE_STAGES),
    pipelines.updateStage,
  );
  router.delete(
    `${pipelinePath}/stages/:stageId`,
    ...guard(OrganizationPermission.PIPELINE_MANAGE_STAGES),
    pipelines.removeStage,
  );
  // Moving is its own operation, not a lead update: it needs pipeline:move_lead and nothing else.
  router.patch(`${leadsPath}/:leadId/stage`, ...guard(OrganizationPermission.PIPELINE_MOVE_LEAD), pipelines.moveLead);

  // Tasks belong to one organization, like leads. Assigning (assignedToUserId in a body, null
  // included) additionally needs task:assign, which the controller checks because it depends
  // on the body.
  const tasksPath = "/organizations/:organizationId/tasks";
  router.post(tasksPath, ...guard(OrganizationPermission.TASK_CREATE), tasks.create);
  router.get(tasksPath, ...guard(OrganizationPermission.TASK_READ), tasks.list);
  router.get(`${tasksPath}/:taskId`, ...guard(OrganizationPermission.TASK_READ), tasks.get);
  router.patch(`${tasksPath}/:taskId`, ...guard(OrganizationPermission.TASK_UPDATE), tasks.update);
  router.delete(`${tasksPath}/:taskId`, ...guard(OrganizationPermission.TASK_DELETE), tasks.remove);

  return router;
}
