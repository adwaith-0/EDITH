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
    url: process.env["DATABASE_URL"],
  },
});
