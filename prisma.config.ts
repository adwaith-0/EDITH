// This file configures Prisma for the EV Charging Admin Dashboard
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env file from project root
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    // Migrations use a direct database connection when the provider supplies it.
    // The application continues to use DATABASE_URL's pooled connection.
    url: process.env["DATABASE_URL_UNPOOLED"] || process.env["DATABASE_URL"],
  },
});
