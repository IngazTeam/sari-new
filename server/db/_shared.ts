/**
 * Shared Database Utilities
 * Common imports and utilities used across all db modules
 * 
 * IMPORTANT: This file imports getDb from main db.ts to avoid duplication
 */
import { eq, and, or, desc, gte, lte, lt, gt, sql, like, asc } from "drizzle-orm";

// Re-export common operators for use in modules
export { eq, and, or, desc, gte, lte, lt, gt, sql, like, asc };

// Import getDb from main db.ts to avoid duplication
// Modules that need getDb should import it from here
import { getDb, formatDateForDB } from "../db";
export { getDb, formatDateForDB };
