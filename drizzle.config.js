import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.mjs",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DB_FILE_NAME,
  },
});
