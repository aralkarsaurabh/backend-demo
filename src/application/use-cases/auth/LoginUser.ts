import { randomUUID } from "node:crypto";
import { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository";
import { UserRepository } from "../../../domain/repositories/UserRepository";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { LoginResponse } from "../../dto/auth/AuthResponse";
import { LoginRequest } from "../../dto/auth/LoginRequest";
import { toUserResponse } from "../../dto/user/UserResponse";
import { PasswordService } from "../../services/PasswordService";
import { TokenService } from "../../services/TokenService";
import { issueTokenPair } from "./issueTokenPair";

export class LoginUser {
  // Compared against when the email is unknown, so a missing account costs the
  // same time as a wrong password and can't be told apart by response time.
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async execute(request: LoginRequest): Promise<LoginResponse> {
    const user = await this.users.findByEmail(request.email);

    if (!user) {
      this.dummyHash ??= this.passwords.hash(randomUUID());
      await this.passwords.compare(request.password, await this.dummyHash);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }

    if (!(await this.passwords.compare(request.password, user.passwordHash))) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }

    // A login starts a new token family.
    const { pair, record } = issueTokenPair(this.tokens, user, randomUUID());
    await this.refreshTokens.create(record);

    return { user: toUserResponse(user), tokens: pair };
  }
}
