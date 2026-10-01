-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SALES', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DESIGNER', 'CONTRACTOR', 'DEALER', 'HOMEOWNER');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('CASH', 'MONTHLY_30', 'DEPOSIT_BALANCE');

-- CreateEnum
CREATE TYPE "HardwareCategory" AS ENUM ('HINGE', 'SLIDE', 'PULLOUT', 'HANDLE', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('INQUIRY', 'MEASUREMENT', 'QUOTE', 'CONTRACT', 'CAD_DRAWING', 'HANDOFF', 'DONE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('BOARD', 'HARDWARE', 'PROCESSING', 'OTHER');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('SITE_VISIT', 'DRAWING', 'QUOTE_FOLLOWUP', 'PAYMENT_REMINDER');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customer_type" "CustomerType" NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "default_discount" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "payment_terms" "PaymentTerms" NOT NULL DEFAULT 'DEPOSIT_BALANCE',
    "sales_rep_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_boards" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "color_code" TEXT NOT NULL,
    "thickness_mm" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '才',
    "retail_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_hardware" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "category" "HardwareCategory" NOT NULL,
    "retail_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_hardware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_processing" (
    "id" TEXT NOT NULL,
    "process_name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "retail_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "site_address" TEXT NOT NULL,
    "site_condition" TEXT,
    "sales_rep_id" TEXT NOT NULL,
    "sales_assistant_id" TEXT,
    "current_stage" "ProjectStage" NOT NULL DEFAULT 'INQUIRY',
    "is_delayed" BOOLEAN NOT NULL DEFAULT false,
    "expected_date" TIMESTAMP(3),
    "estimated_budget" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'V1',
    "discount_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "raw_subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_cabinets" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "area_zone" TEXT NOT NULL,
    "cabinet_name" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "cabinet_subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_cabinets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_components" (
    "id" TEXT NOT NULL,
    "cabinet_item_id" TEXT NOT NULL,
    "component_type" "ComponentType" NOT NULL,
    "item_name_spec" TEXT NOT NULL,
    "thickness" INTEGER,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "stage_order" INTEGER NOT NULL DEFAULT 1,
    "planned_start" TIMESTAMP(3),
    "planned_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to_id" TEXT,
    "attachments" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "assigned_to_id" TEXT NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "subject" TEXT NOT NULL,
    "due_datetime" TIMESTAMP(3) NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "result_notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "master_boards_brand_thickness_mm_idx" ON "master_boards"("brand", "thickness_mm");

-- CreateIndex
CREATE INDEX "master_hardware_category_brand_idx" ON "master_hardware"("category", "brand");

-- CreateIndex
CREATE INDEX "projects_current_stage_is_delayed_idx" ON "projects"("current_stage", "is_delayed");

-- CreateIndex
CREATE INDEX "project_milestones_status_planned_end_idx" ON "project_milestones"("status", "planned_end");

-- CreateIndex
CREATE INDEX "sales_tasks_is_completed_due_datetime_idx" ON "sales_tasks"("is_completed", "due_datetime");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sales_assistant_id_fkey" FOREIGN KEY ("sales_assistant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_cabinets" ADD CONSTRAINT "quote_cabinets_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_components" ADD CONSTRAINT "quote_components_cabinet_item_id_fkey" FOREIGN KEY ("cabinet_item_id") REFERENCES "quote_cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

