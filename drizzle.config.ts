import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

const url =
  process.env.DATABASE_URL_UNPOOLED?.trim() ??
  process.env.DATABASE_URL?.trim();

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL is required for database migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./agent/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
