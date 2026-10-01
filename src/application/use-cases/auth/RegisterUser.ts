import { UserRole } from "../../../domain/enums/UserRole";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { RegisterResponse } from "../../dto/auth/AuthResponse";
import { RegisterRequest } from "../../dto/auth/RegisterRequest";
import { toUserResponse } from "../../dto/user/UserResponse";
import { PasswordService } from "../../services/PasswordService";

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
  ) {}

  async execute(request: RegisterRequest): Promise<RegisterResponse> {
    if (await this.users.findByEmail(request.email)) {
      throw new AppError(ErrorCode.EMAIL_ALREADY_EXISTS);
    }

    // A concurrent duplicate that slips past the check above is caught by the
    // repository, which maps the unique-constraint violation to the same error.
    const user = await this.users.create({
      name: request.name,
      email: request.email,
      passwordHash: await this.passwords.hash(request.password),
      role: UserRole.USER,
    });

    return { user: toUserResponse(user) };
  }
}
