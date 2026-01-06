import { getDb } from "./db";
import { smtpSettings, emailLogs } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

// Encryption key (should be in env in production)
const ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || "sari-smtp-encryption-key-32ch";
const ALGORITHM = "aes-256-cbc";

// Encrypt password
export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

// Decrypt password
export function decryptPassword(encryptedPassword: string): string {
  const [ivHex, encrypted] = encryptedPassword.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Get SMTP settings
export async function getSmtpSettings() {
  const db = await getDb();
  const settings = await db.select().from(smtpSettings).where(eq(smtpSettings.isActive, true)).limit(1);
  if (settings.length === 0) return null;
  
  const setting = settings[0];
  return {
    ...setting,
    password: decryptPassword(setting.password),
  };
}

// Create or update SMTP settings
export async function upsertSmtpSettings(data: {
  host: string;
  port: number;
  username: string;
  password?: string;
  fromEmail: string;
  fromName: string;
}) {
  const db = await getDb();
  const existing = await db.select().from(smtpSettings).limit(1);
  
  const settingsData: any = {
    host: data.host,
    port: data.port,
    username: data.username,
    fromEmail: data.fromEmail,
    fromName: data.fromName,
    isActive: true,
  };

  // Only update password if provided
  if (data.password) {
    settingsData.password = encryptPassword(data.password);
  }

  if (existing.length === 0) {
    // Create new
    if (!data.password) {
      throw new Error("Password is required for new SMTP settings");
    }
    return await db.insert(smtpSettings).values(settingsData);
  } else {
    // Update existing
    return await db.update(smtpSettings).set(settingsData).where(eq(smtpSettings.id, existing[0].id));
  }
}

// Create email log
export async function createEmailLog(data: {
  toEmail: string;
  subject: string;
  body: string;
  status?: string;
  error?: string;
}) {
  const db = await getDb();
  return await db.insert(emailLogs).values({
    toEmail: data.toEmail,
    subject: data.subject,
    body: data.body,
    status: data.status || "pending",
    error: data.error,
  });
}

// Update email log status
export async function updateEmailLogStatus(id: number, status: string, error?: string) {
  const db = await getDb();
  return await db
    .update(emailLogs)
    .set({
      status,
      error,
      sentAt: status === "sent" ? new Date() : undefined,
    })
    .where(eq(emailLogs.id, id));
}

// Get email logs
export async function getEmailLogs(limit: number = 50) {
  const db = await getDb();
  return await db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit);
}

// Get email stats
export async function getEmailStats() {
  const db = await getDb();
  const logs = await db.select().from(emailLogs);
  
  return {
    totalEmails: logs.length,
    sentEmails: logs.filter((log) => log.status === "sent").length,
    failedEmails: logs.filter((log) => log.status === "failed").length,
    pendingEmails: logs.filter((log) => log.status === "pending").length,
  };
}
