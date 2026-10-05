CREATE TABLE "role_page_access" (
  "role" "Role" NOT NULL,
  "pages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "role_page_access_pkey" PRIMARY KEY ("role")
);

INSERT INTO "role_page_access" ("role", "pages") VALUES
  ('ADMIN', ARRAY['home', 'workbench', 'manager', 'views', 'customers', 'projects', 'admin']),
  ('LEVEL_MANAGER', ARRAY['home', 'workbench', 'manager', 'views', 'customers', 'projects']),
  ('SALES_MANAGER', ARRAY['home', 'workbench', 'manager', 'views', 'customers', 'projects']),
  ('SALES', ARRAY['home', 'workbench', 'views', 'customers', 'projects']),
  ('ASSISTANT', ARRAY['home', 'workbench', 'views', 'projects']);
