/**
 * Database Modules Index
 * Re-exports all database functions for backward compatibility
 */

// Shared utilities
export { getDb, formatDateForDB } from "./_shared";

// Domain modules
export * from "./products";
export * from "./conversations";
export * from "./whatsapp";
export * from "./subscriptions";
