import { Request, Response } from "express";
import {
  createCustomerRequestSchema,
  customerParamsSchema,
} from "../../../application/dto/customer/CustomerRequests";
import { CreateCustomer } from "../../../application/use-cases/customer/CreateCustomer";
import { GetCustomer } from "../../../application/use-cases/customer/GetCustomer";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface CustomerUseCases {
  createCustomer: CreateCustomer;
  getCustomer: GetCustomer;
}

const currentUser = (req: Request) => {
  if (!req.user) throw new AppError(ErrorCode.UNAUTHORIZED);
  return req.user;
};

/** Set by requireOrganizationMembership; every customer route runs it first. */
const currentMembership = (req: Request) => {
  if (!req.organizationMembership) throw new AppError(ErrorCode.ORGANIZATION_NOT_FOUND);
  return req.organizationMembership;
};

// Logs carry ids only, never a customer's name, email, phone or notes.
export class CustomerController {
  constructor(
    private readonly useCases: CustomerUseCases,
    private readonly logger: Logger,
  ) {}

  create = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const body = parseOrThrow(createCustomerRequestSchema, req.body ?? {});
    const result = await this.useCases.createCustomer.execute(organizationId, body);

    this.logger.info("customer_created", {
      userId: user.id,
      organizationId,
      customerId: result.customer.id,
    });
    res.status(201).json(ApiResponse.success("Customer created successfully.", result));
  };

  get = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const { customerId } = parseOrThrow(customerParamsSchema, req.params);
    const result = await this.useCases.getCustomer.execute(organizationId, customerId);
    res.status(200).json(ApiResponse.success("Customer retrieved successfully.", result));
  };
}
