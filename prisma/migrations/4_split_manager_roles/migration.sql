CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'LEVEL_MANAGER', 'SALES_MANAGER', 'SALES', 'ASSISTANT');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'MANAGER' THEN 'SALES_MANAGER'
      ELSE "role"::text
    END
  )::"Role_new";

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'SALES'::"Role";
DROP TYPE "Role_old";
