import { CustomerService } from "./services/customer-service";
import { ConfigService } from "./services/config-service";
import { MilestoneService } from "./services/milestone-service";
import { ProjectService } from "./services/project-service";
import { TaskService } from "./services/task-service";
import { invalidateLoginUsersCache } from "./services/shared";

export { invalidateLoginUsersCache };
export {
  CustomerService,
  ConfigService,
  MilestoneService,
  ProjectService,
  TaskService,
};

/**
 * DataService Facade
 * 彙整各領域專用 Service，提供向後相容的單一入口。
 * 所有現有 API 路由 (`/api/**`) 無需修改既有引用路徑即可無縫運行。
 */
export const DataService = {
  ...CustomerService,
  ...ConfigService,
  ...MilestoneService,
  ...ProjectService,
  ...TaskService,
};
