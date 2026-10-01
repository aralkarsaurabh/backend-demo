import { Request, Response } from "express";
import { loginRequestSchema } from "../../../application/dto/auth/LoginRequest";
import { refreshTokenRequestSchema } from "../../../application/dto/auth/RefreshTokenRequest";
import { registerRequestSchema } from "../../../application/dto/auth/RegisterRequest";
import { LoginUser } from "../../../application/use-cases/auth/LoginUser";
import { LogoutUser } from "../../../application/use-cases/auth/LogoutUser";
import { RefreshTokens } from "../../../application/use-cases/auth/RefreshTokens";
import { RegisterUser } from "../../../application/use-cases/auth/RegisterUser";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface AuthUseCases {
  registerUser: RegisterUser;
  loginUser: LoginUser;
  refreshTokens: RefreshTokens;
  logoutUser: LogoutUser;
}

const clientInfo = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

export class AuthController {
  constructor(
    private readonly useCases: AuthUseCases,
    private readonly logger: Logger,
  ) {}

  register = async (req: Request, res: Response) => {
    const body = parseOrThrow(registerRequestSchema, req.body ?? {});
    const result = await this.useCases.registerUser.execute(body);

    this.logger.info("register", { userId: result.user.id, ...clientInfo(req) });
    res.status(201).json(ApiResponse.success("Account created successfully.", result));
  };

  login = async (req: Request, res: Response) => {
    const body = parseOrThrow(loginRequestSchema, req.body ?? {});

    let result;
    try {
      result = await this.useCases.loginUser.execute(body);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.INVALID_CREDENTIALS) {
        this.logger.info("login_failure", clientInfo(req));
      }
      throw error;
    }

    this.logger.info("login_success", { userId: result.user.id, ...clientInfo(req) });
    res.status(200).json(ApiResponse.success("Login successful.", result));
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = parseOrThrow(refreshTokenRequestSchema, {
      authorization: req.headers.authorization,
    });

    let result;
    try {
      result = await this.useCases.refreshTokens.execute({ refreshToken });
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.REFRESH_TOKEN_REUSED) {
        this.logger.info("refresh_reuse_detected", clientInfo(req));
      }
      throw error;
    }

    this.logger.info("refresh", clientInfo(req));
    res.status(200).json(ApiResponse.success("Token refreshed.", result));
  };

  logout = async (req: Request, res: Response) => {
    const { refreshToken } = parseOrThrow(refreshTokenRequestSchema, {
      authorization: req.headers.authorization,
    });
    await this.useCases.logoutUser.execute({ refreshToken });

    this.logger.info("logout", clientInfo(req));
    res
      .status(200)
      .json(ApiResponse.success("You have been logged out successfully.", null));
  };
}
