import { Request, Response } from "express";
import {
  createCustomerRequestSchema,
  customerListQuerySchema,
  customerParamsSchema,
  updateCustomerRequestSchema,
} from "../../../application/dto/customer/CustomerRequests";
import { CreateCustomer } from "../../../application/use-cases/customer/CreateCustomer";
import { DeleteCustomer } from "../../../application/use-cases/customer/DeleteCustomer";
import { GetCustomer } from "../../../application/use-cases/customer/GetCustomer";
import { UpdateCustomer } from "../../../application/use-cases/customer/UpdateCustomer";
import { ListCustomers } from "../../../application/use-cases/customer/ListCustomers";
import { AppError } from "../../../shared/errors/AppError";
import { ErrorCode } from "../../../shared/errors/error-codes";
import { Logger } from "../../../shared/logger";
import { ApiResponse } from "../../../shared/response/ApiResponse";
import { parseOrThrow } from "../../../shared/validation/parse";

export interface CustomerUseCases {
  createCustomer: CreateCustomer;
  getCustomer: GetCustomer;
  listCustomers: ListCustomers;
  updateCustomer: UpdateCustomer;
  deleteCustomer: DeleteCustomer;
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

  list = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const query = parseOrThrow(customerListQuerySchema, req.query);
    const result = await this.useCases.listCustomers.execute(organizationId, query);
    res.status(200).json(ApiResponse.success("Customers retrieved successfully.", result));
  };

  update = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { customerId } = parseOrThrow(customerParamsSchema, req.params);
    const body = parseOrThrow(updateCustomerRequestSchema, req.body ?? {});
    const result = await this.useCases.updateCustomer.execute(organizationId, customerId, body);

    this.logger.info("customer_updated", {
      userId: user.id,
      organizationId,
      customerId,
      // field names only, never the values
      changedFields: Object.keys(body)
        .filter((key) => body[key as keyof typeof body] !== undefined)
        .join(","),
    });
    res.status(200).json(ApiResponse.success("Customer updated successfully.", result));
  };

  remove = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { organizationId } = currentMembership(req);
    const { customerId } = parseOrThrow(customerParamsSchema, req.params);
    await this.useCases.deleteCustomer.execute(organizationId, customerId);

    this.logger.info("customer_deleted", { userId: user.id, organizationId, customerId });
    res.status(200).json(ApiResponse.success("Customer deleted successfully.", null));
  };

  get = async (req: Request, res: Response) => {
    const { organizationId } = currentMembership(req);
    const { customerId } = parseOrThrow(customerParamsSchema, req.params);
    const result = await this.useCases.getCustomer.execute(organizationId, customerId);
    res.status(200).json(ApiResponse.success("Customer retrieved successfully.", result));
  };
}
