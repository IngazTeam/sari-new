import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// إنشاء جدول notification_preferences
await connection.execute(`
  CREATE TABLE IF NOT EXISTS notification_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    new_orders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    new_messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    appointments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    order_status_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    missed_messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_disconnect_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    preferred_method ENUM('push', 'email', 'both') NOT NULL DEFAULT 'both',
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    quiet_hours_start VARCHAR(5) DEFAULT '22:00',
    quiet_hours_end VARCHAR(5) DEFAULT '08:00',
    instant_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    batch_notifications BOOLEAN NOT NULL DEFAULT FALSE,
    batch_interval INT DEFAULT 30,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    INDEX notification_preferences_merchant_id_idx (merchant_id)
  )
`);

// إنشاء جدول notification_logs
await connection.execute(`
  CREATE TABLE IF NOT EXISTS notification_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    type ENUM('new_order', 'new_message', 'appointment', 'order_status', 'missed_message', 'whatsapp_disconnect', 'weekly_report', 'custom') NOT NULL,
    method ENUM('push', 'email', 'both') NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    url VARCHAR(500),
    status ENUM('pending', 'sent', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
    error TEXT,
    metadata TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    INDEX notification_logs_merchant_id_idx (merchant_id),
    INDEX notification_logs_type_idx (type),
    INDEX notification_logs_status_idx (status),
    INDEX notification_logs_created_at_idx (created_at)
  )
`);

// إنشاء جدول notification_settings
await connection.execute(`
  CREATE TABLE IF NOT EXISTS notification_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    new_orders_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    new_messages_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    appointments_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    order_status_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    missed_messages_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_disconnect_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_reports_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_report_day INT NOT NULL DEFAULT 0,
    weekly_report_time VARCHAR(5) NOT NULL DEFAULT '09:00',
    admin_email VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);

// تحديث جدول email_logs
await connection.execute(`
  ALTER TABLE email_logs 
  ADD COLUMN IF NOT EXISTS email_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS merchant_id INT,
  ADD COLUMN IF NOT EXISTS metadata TEXT
`);

console.log('✅ تم تطبيق جميع التغييرات على قاعدة البيانات بنجاح');

await connection.end();
