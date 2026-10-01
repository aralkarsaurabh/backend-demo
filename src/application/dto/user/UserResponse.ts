import { User } from "../../../domain/entities/User";
import { UserRole } from "../../../domain/enums/UserRole";

/** The only shape of a user that ever leaves the API. No passwordHash. */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
