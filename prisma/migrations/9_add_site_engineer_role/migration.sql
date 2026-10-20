ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SITE_ENGINEER';
INSERT INTO "role_page_access" ("role", "pages") VALUES ('SITE_ENGINEER', ARRAY['home', 'workbench', 'views', 'projects']) ON CONFLICT ("role") DO NOTHING;
