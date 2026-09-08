#!/usr/bin/env node

/**
 * Fail the Vercel build before a deployment can be marked usable when the
 * serverless API would reject its configuration at import time.
 *
 * This intentionally validates names and safe metadata only. It never logs
 * connection strings, tokens, or secret values.
 */

import { URL } from "node:url";

const environment = (
  process.env.VERCEL_ENV || process.env.ENVIRONMENT || "development"
).toLowerCase();

if (!["preview", "production"].includes(environment)) {
  console.log(`Vercel environment preflight skipped for ${environment}.`);
  process.exit(0);
}

const errors = [];
const value = (name) => process.env[name]?.trim() || "";

const databaseUrl = value("DATABASE_URL");
const migrationDatabaseUrl = value("MIGRATION_DATABASE_URL");
const secretKey = value("SECRET_KEY");
const cronSecret = value("CRON_SECRET");
const corsOrigins = value("CORS_ORIGINS")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isLocalDatabase = (connectionString) => {
  if (!connectionString) return true;
  try {
    const parsed = new URL(connectionString);
    return (
      ["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname) ||
      connectionString.includes("change_me_in_production")
    );
  } catch {
    return true;
  }
};

const databaseRole = (connectionString) => {
  if (!connectionString) return "";
  try {
    return decodeURIComponent(new URL(connectionString).username || "");
  } catch {
    return "";
  }
};

if (!databaseUrl || isLocalDatabase(databaseUrl)) {
  errors.push("DATABASE_URL must point to a managed database");
}
if (databaseRole(databaseUrl) !== "app_runtime") {
  errors.push("DATABASE_URL must use the dedicated app_runtime role");
}

if (!migrationDatabaseUrl || isLocalDatabase(migrationDatabaseUrl)) {
  errors.push(
    "MIGRATION_DATABASE_URL must point to a separate managed migration database",
  );
}
if (databaseUrl && migrationDatabaseUrl && databaseUrl === migrationDatabaseUrl) {
  errors.push("MIGRATION_DATABASE_URL must not equal DATABASE_URL");
}
if (databaseRole(migrationDatabaseUrl) !== "app_migrator") {
  errors.push("MIGRATION_DATABASE_URL must use the dedicated app_migrator role");
}

if (secretKey.length < 32 || secretKey === "your-secret-key-change-this-in-production") {
  errors.push("SECRET_KEY must be a unique value of at least 32 characters");
}
if (cronSecret.length < 32 || cronSecret === "replace-with-a-long-random-cron-secret") {
  errors.push("CRON_SECRET must be a unique value of at least 32 characters");
}

if (String(process.env.DEBUG || "false").toLowerCase() === "true") {
  errors.push("DEBUG must be false outside development");
}
if (String(process.env.ENABLE_AUTH || "true").toLowerCase() !== "true") {
  errors.push("ENABLE_AUTH must be true outside development");
}
if (String(process.env.ENABLE_RATE_LIMITING || "true").toLowerCase() !== "true") {
  errors.push("ENABLE_RATE_LIMITING must be true outside development");
}

if (
  corsOrigins.length === 0 ||
  corsOrigins.includes("*") ||
  !corsOrigins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "https:" && !parsed.pathname.slice(1);
    } catch {
      return false;
    }
  })
) {
  errors.push("CORS_ORIGINS must include an explicit deployed HTTPS origin");
}

if (errors.length > 0) {
  console.error("Vercel environment preflight failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Vercel environment preflight passed for ${environment}.`);
