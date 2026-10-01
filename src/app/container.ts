import { PasswordService } from "../application/services/PasswordService";
import { TokenService } from "../application/services/TokenService";
import { LoginUser } from "../application/use-cases/auth/LoginUser";
import { LogoutUser } from "../application/use-cases/auth/LogoutUser";
import { RefreshTokens } from "../application/use-cases/auth/RefreshTokens";
import { RegisterUser } from "../application/use-cases/auth/RegisterUser";
import { AcceptOrganizationInvitation } from "../application/use-cases/organization/AcceptOrganizationInvitation";
import { CreateOrganization } from "../application/use-cases/organization/CreateOrganization";
import { GetOrganization } from "../application/use-cases/organization/GetOrganization";
import { InviteOrganizationMember } from "../application/use-cases/organization/InviteOrganizationMember";
import { ListOrganizationMembers } from "../application/use-cases/organization/ListOrganizationMembers";
import { ListUserOrganizations } from "../application/use-cases/organization/ListUserOrganizations";
import { RemoveOrganizationMember } from "../application/use-cases/organization/RemoveOrganizationMember";
import { UpdateOrganizationMemberRole } from "../application/use-cases/organization/UpdateOrganizationMemberRole";
import { CreateCustomer } from "../application/use-cases/customer/CreateCustomer";
import { ListCustomers } from "../application/use-cases/customer/ListCustomers";
import { UpdateCustomer } from "../application/use-cases/customer/UpdateCustomer";
import { DeleteCustomer } from "../application/use-cases/customer/DeleteCustomer";
import { GetCustomer } from "../application/use-cases/customer/GetCustomer";
import { AssignLead } from "../application/use-cases/lead/AssignLead";
import { ConvertLead } from "../application/use-cases/lead/ConvertLead";
import { CreateLead } from "../application/use-cases/lead/CreateLead";
import { DeleteLead } from "../application/use-cases/lead/DeleteLead";
import { GetLead } from "../application/use-cases/lead/GetLead";
import { ListLeads } from "../application/use-cases/lead/ListLeads";
import { UpdateLead } from "../application/use-cases/lead/UpdateLead";
import { CreatePipeline } from "../application/use-cases/pipeline/CreatePipeline";
import { ListPipelines } from "../application/use-cases/pipeline/ListPipelines";
import { GetPipeline } from "../application/use-cases/pipeline/GetPipeline";
import { UpdatePipeline } from "../application/use-cases/pipeline/UpdatePipeline";
import { DeletePipeline } from "../application/use-cases/pipeline/DeletePipeline";
import { CreatePipelineStage } from "../application/use-cases/pipeline/CreatePipelineStage";
import { UpdatePipelineStage } from "../application/use-cases/pipeline/UpdatePipelineStage";
import { DeletePipelineStage } from "../application/use-cases/pipeline/DeletePipelineStage";
import { ReorderPipelineStages } from "../application/use-cases/pipeline/ReorderPipelineStages";
import { MoveLeadToStage } from "../application/use-cases/pipeline/MoveLeadToStage";
import { GetPipelineSummary } from "../application/use-cases/pipeline/GetPipelineSummary";
import { AssignTask } from "../application/use-cases/task/AssignTask";
import { CreateTask } from "../application/use-cases/task/CreateTask";
import { DeleteTask } from "../application/use-cases/task/DeleteTask";
import { GetTask } from "../application/use-cases/task/GetTask";
import { ListTasks } from "../application/use-cases/task/ListTasks";
import { UpdateTask } from "../application/use-cases/task/UpdateTask";
import { ChangePassword } from "../application/use-cases/user/ChangePassword";
import { UpdateCurrentUser } from "../application/use-cases/user/UpdateCurrentUser";
import { UpdateUserStatus } from "../application/use-cases/user/UpdateUserStatus";
import { GetCurrentUser } from "../application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../application/use-cases/user/ListUsers";
import { CustomerRepository } from "../domain/repositories/CustomerRepository";
import { LeadRepository } from "../domain/repositories/LeadRepository";
import { OrganizationInvitationRepository } from "../domain/repositories/OrganizationInvitationRepository";
import { OrganizationMembershipRepository } from "../domain/repositories/OrganizationMembershipRepository";
import { OrganizationRepository } from "../domain/repositories/OrganizationRepository";
import { PipelineRepository } from "../domain/repositories/PipelineRepository";
import { PipelineStageRepository } from "../domain/repositories/PipelineStageRepository";
import { RefreshTokenRepository } from "../domain/repositories/RefreshTokenRepository";
import { TaskRepository } from "../domain/repositories/TaskRepository";
import { UserRepository } from "../domain/repositories/UserRepository";

export interface Dependencies {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  organizations: OrganizationRepository;
  organizationMemberships: OrganizationMembershipRepository;
  organizationInvitations: OrganizationInvitationRepository;
  customers: CustomerRepository;
  leads: LeadRepository;
  pipelines: PipelineRepository;
  pipelineStages: PipelineStageRepository;
  tasks: TaskRepository;
  passwords: PasswordService;
  tokens: TokenService;
}

/** The one place where use cases are wired to their dependencies. */
export function buildContainer({
  users,
  refreshTokens,
  organizations,
  organizationMemberships,
  organizationInvitations,
  customers,
  leads,
  pipelines,
  pipelineStages,
  tasks,
  passwords,
  tokens,
}: Dependencies) {
  const assignTask = new AssignTask(organizationMemberships);

  return {
    tokens,
    // The organization middleware looks the caller's membership up on every request.
    organizationMemberships,
    registerUser: new RegisterUser(users, passwords),
    loginUser: new LoginUser(users, refreshTokens, passwords, tokens),
    refreshTokens: new RefreshTokens(users, refreshTokens, tokens),
    logoutUser: new LogoutUser(refreshTokens, tokens),
    getCurrentUser: new GetCurrentUser(users),
    listUsers: new ListUsers(users),
    updateCurrentUser: new UpdateCurrentUser(users),
    changePassword: new ChangePassword(users, refreshTokens, passwords),
    updateUserStatus: new UpdateUserStatus(users, refreshTokens),
    createOrganization: new CreateOrganization(organizations),
    listUserOrganizations: new ListUserOrganizations(organizations),
    getOrganization: new GetOrganization(organizations),
    inviteOrganizationMember: new InviteOrganizationMember(
      users,
      organizationMemberships,
      organizationInvitations,
      tokens,
    ),
    acceptOrganizationInvitation: new AcceptOrganizationInvitation(
      users,
      organizations,
      organizationMemberships,
      organizationInvitations,
      tokens,
    ),
    listOrganizationMembers: new ListOrganizationMembers(organizationMemberships),
    updateOrganizationMemberRole: new UpdateOrganizationMemberRole(organizationMemberships),
    removeOrganizationMember: new RemoveOrganizationMember(organizationMemberships),
    createCustomer: new CreateCustomer(customers),
    getCustomer: new GetCustomer(customers),
    listCustomers: new ListCustomers(customers),
    updateCustomer: new UpdateCustomer(customers),
    deleteCustomer: new DeleteCustomer(customers),
    createLead: new CreateLead(leads),
    getLead: new GetLead(leads),
    listLeads: new ListLeads(leads),
    updateLead: new UpdateLead(leads, new AssignLead(organizationMemberships)),
    deleteLead: new DeleteLead(leads),
    convertLead: new ConvertLead(leads),
    createPipeline: new CreatePipeline(pipelines),
    listPipelines: new ListPipelines(pipelines),
    getPipeline: new GetPipeline(pipelines),
    updatePipeline: new UpdatePipeline(pipelines),
    deletePipeline: new DeletePipeline(pipelines),
    createPipelineStage: new CreatePipelineStage(pipelineStages),
    updatePipelineStage: new UpdatePipelineStage(pipelines, pipelineStages),
    deletePipelineStage: new DeletePipelineStage(pipelines, pipelineStages),
    reorderPipelineStages: new ReorderPipelineStages(pipelines, pipelineStages),
    moveLeadToStage: new MoveLeadToStage(leads, pipelineStages),
    getPipelineSummary: new GetPipelineSummary(pipelines),
    createTask: new CreateTask(tasks, assignTask),
    getTask: new GetTask(tasks),
    listTasks: new ListTasks(tasks),
    updateTask: new UpdateTask(tasks, assignTask),
    deleteTask: new DeleteTask(tasks),
  };
}

export type Container = ReturnType<typeof buildContainer>;
