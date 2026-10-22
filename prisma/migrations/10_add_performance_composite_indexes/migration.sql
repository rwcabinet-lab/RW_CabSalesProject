-- CreateIndex
CREATE INDEX "customers_created_at_idx" ON "customers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "project_milestones_assigned_to_id_project_id_idx" ON "project_milestones"("assigned_to_id", "project_id");

-- CreateIndex
CREATE INDEX "project_milestones_planned_due_date_status_idx" ON "project_milestones"("planned_due_date", "status");

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_sales_rep_id_created_at_idx" ON "projects"("sales_rep_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_sales_assistant_id_created_at_idx" ON "projects"("sales_assistant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_tasks_assigned_to_id_project_id_idx" ON "sales_tasks"("assigned_to_id", "project_id");
