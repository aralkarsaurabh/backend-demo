import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { PaginationResponse, toPaginationResponse } from "../../dto/customer/CustomerResponse";
import { ListTasksRequest } from "../../dto/task/TaskRequests";
import { TaskListItemResponse, toTaskListItem } from "../../dto/task/TaskResponse";

export class ListTasks {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(
    organizationId: string,
    query: ListTasksRequest,
  ): Promise<{ tasks: TaskListItemResponse[]; pagination: PaginationResponse }> {
    const { items, totalItems } = await this.tasks.list(organizationId, query);
    return {
      tasks: items.map(toTaskListItem),
      pagination: toPaginationResponse(query.page, query.limit, totalItems),
    };
  }
}
