/**
 * Shared Database Utilities
 * Common imports and utilities used across all db modules
 * 
 * The connection layer is independent of the legacy database facade.
 */
import { eq, and, or, desc, gte, lte, lt, gt, sql, like, asc } from "drizzle-orm";

// Re-export common operators for use in modules
export { eq, and, or, desc, gte, lte, lt, gt, sql, like, asc };

import { getDb, getPool, formatDateForDB } from "./connection";
export { getDb, getPool, formatDateForDB };
