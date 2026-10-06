ALTER TABLE "project_milestones"
ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';

ALTER TABLE "sales_tasks"
ADD COLUMN "assigned_by_id" TEXT;

ALTER TABLE "sales_tasks"
ADD CONSTRAINT "sales_tasks_assigned_by_id_fkey"
FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
