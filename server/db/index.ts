/**
 * Database Modules Index
 * Re-exports all database functions for backward compatibility
 */

// Shared utilities
export { getDb, closeDb, formatDateForDB } from "./_shared";

// Domain modules
export * from "./products";
