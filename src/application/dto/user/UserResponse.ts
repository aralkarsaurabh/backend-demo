import { User } from "../../../domain/entities/User";
import { UserRole } from "../../../domain/enums/UserRole";
import { UserStatus } from "../../../domain/enums/UserStatus";

/** The only shape of a user that ever leaves the API. No passwordHash. */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** The account view returned by the user-management endpoints. */
export interface ProfileResponse extends UserResponse {
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserResponse extends UserResponse {
  createdAt: string;
}

export function toUserResponse(user: User): UserResponse {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function toAdminUserResponse(user: User): AdminUserResponse {
  return { ...toUserResponse(user), createdAt: user.createdAt.toISOString() };
}

export function toProfileResponse(user: User): ProfileResponse {
  return {
    ...toUserResponse(user),
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
