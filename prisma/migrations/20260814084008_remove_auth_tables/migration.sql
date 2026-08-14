-- Drop NextAuth-only tables and columns now that the app is single-user
-- with no login (see lib/currentUser.ts).

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "Account";

-- DropTable
DROP TABLE IF EXISTS "Session";

-- DropTable
DROP TABLE IF EXISTS "VerificationToken";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";
ALTER TABLE "User" DROP COLUMN IF EXISTS "image";
