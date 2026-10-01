import { User } from "../../../domain/entities/User";
import { UserStatus } from "../../../domain/enums/UserStatus";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";

/** Throws the status-specific code for a suspended or deactivated account. */
export function assertAccountActive(user: User): void {
  if (user.status === UserStatus.SUSPENDED) throw new AppError(ErrorCode.ACCOUNT_SUSPENDED);
  if (user.status === UserStatus.DEACTIVATED) throw new AppError(ErrorCode.ACCOUNT_DEACTIVATED);
}
