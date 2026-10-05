/*
  Warnings:

  - You are about to drop the column `role` on the `store_members` table. All the data in the column will be lost.
  - You are about to drop the column `is_super_admin` on the `users` table. All the data in the column will be lost.
  - Changed the type of `role` on the `store_invites` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'ORDER_MANAGER', 'VIEWER', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "store_invites" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL;

-- AlterTable
ALTER TABLE "store_members" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_super_admin",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'OWNER';

-- DropEnum
DROP TYPE "StoreRole";
