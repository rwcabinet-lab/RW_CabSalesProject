ALTER TABLE "sales_tasks"
ADD COLUMN "milestone_id" TEXT;

CREATE UNIQUE INDEX "sales_tasks_milestone_id_key"
ON "sales_tasks"("milestone_id");

ALTER TABLE "sales_tasks"
ADD CONSTRAINT "sales_tasks_milestone_id_fkey"
FOREIGN KEY ("milestone_id") REFERENCES "project_milestones"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
