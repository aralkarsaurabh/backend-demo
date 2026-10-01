import { User } from "../entities/User";
import { UserRole } from "../enums/UserRole";
import { UserStatus } from "../enums/UserStatus";

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UpdateUserData {
  name: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Throws AppError(EMAIL_ALREADY_EXISTS) if the email is already taken. */
  create(data: CreateUserData): Promise<User>;
  /** Used by GET /admin/users. */
  findAll(): Promise<User[]>;
  updateProfile(userId: string, data: UpdateUserData): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<User>;
}
