import path from "node:path";
import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // Migrations/introspection should bypass the Neon pooler, so this points
    // at the direct (unpooled) connection string. Runtime queries use
    // DATABASE_URL (pooled) via the adapter in lib/prisma.ts instead.
    url: process.env.DIRECT_URL,
  },
});
