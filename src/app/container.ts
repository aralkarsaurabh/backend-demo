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
import { ChangePassword } from "../application/use-cases/user/ChangePassword";
import { UpdateCurrentUser } from "../application/use-cases/user/UpdateCurrentUser";
import { UpdateUserStatus } from "../application/use-cases/user/UpdateUserStatus";
import { GetCurrentUser } from "../application/use-cases/user/GetCurrentUser";
import { ListUsers } from "../application/use-cases/user/ListUsers";
import { CustomerRepository } from "../domain/repositories/CustomerRepository";
import { OrganizationInvitationRepository } from "../domain/repositories/OrganizationInvitationRepository";
import { OrganizationMembershipRepository } from "../domain/repositories/OrganizationMembershipRepository";
import { OrganizationRepository } from "../domain/repositories/OrganizationRepository";
import { RefreshTokenRepository } from "../domain/repositories/RefreshTokenRepository";
import { UserRepository } from "../domain/repositories/UserRepository";

export interface Dependencies {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  organizations: OrganizationRepository;
  organizationMemberships: OrganizationMembershipRepository;
  organizationInvitations: OrganizationInvitationRepository;
  customers: CustomerRepository;
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
  passwords,
  tokens,
}: Dependencies) {
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
  };
}

export type Container = ReturnType<typeof buildContainer>;
