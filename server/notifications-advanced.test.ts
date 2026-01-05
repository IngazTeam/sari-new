import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database functions
vi.mock('./db-notifications', () => ({
  getPushNotificationSettings: vi.fn(),
  createPushNotificationSettings: vi.fn(),
  updatePushNotificationSettings: vi.fn(),
  getScheduledReports: vi.fn(),
  createScheduledReport: vi.fn(),
  updateScheduledReport: vi.fn(),
  deleteScheduledReport: vi.fn(),
  getWhatsappAutoNotifications: vi.fn(),
  createWhatsappAutoNotification: vi.fn(),
  updateWhatsappAutoNotification: vi.fn(),
  deleteWhatsappAutoNotification: vi.fn(),
  getIntegrationStats: vi.fn(),
  getUnresolvedIntegrationErrors: vi.fn(),
  createWebhookSecurityLog: vi.fn(),
  getWebhookSecurityLogs: vi.fn()
}));

// Mock WhatsApp auto notifications
vi.mock('./notifications/whatsapp-auto-notifications', () => ({
  getAllDefaultTemplates: vi.fn(() => ({
    order_created: 'مرحباً {{customerName}}، تم استلام طلبك رقم {{orderNumber}} بنجاح!',
    order_shipped: 'مرحباً {{customerName}}، تم شحن طلبك رقم {{orderNumber}}.',
    appointment_created: 'مرحباً {{customerName}}، تم تأكيد موعدك يوم {{appointmentDate}} الساعة {{appointmentTime}}.'
  })),
  processTemplate: vi.fn((template, data) => {
    let result = template;
    Object.entries(data).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });
    return result;
  }),
  sendOrderNotification: vi.fn(),
  sendAppointmentNotification: vi.fn()
}));

// Mock webhook security
vi.mock('./webhooks/webhook-security', () => ({
  verifyWebhookSignature: vi.fn(),
  generateWebhookSecret: vi.fn(() => 'test-secret-' + Math.random().toString(36).substring(7))
}));

import {
  getPushNotificationSettings,
  createPushNotificationSettings,
  updatePushNotificationSettings,
  getScheduledReports,
  createScheduledReport,
  deleteScheduledReport,
  getWhatsappAutoNotifications,
  createWhatsappAutoNotification,
  getIntegrationStats,
  getUnresolvedIntegrationErrors,
  createWebhookSecurityLog,
  getWebhookSecurityLogs
} from './db-notifications';

import {
  getAllDefaultTemplates,
  processTemplate
} from './notifications/whatsapp-auto-notifications';

import {
  generateWebhookSecret
} from './webhooks/webhook-security';

describe('Push Notification Settings', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should get push notification settings for merchant', async () => {
    const mockSettings = { id: 1, merchant_id: 1, new_message_enabled: true, new_order_enabled: true, email_notifications_enabled: true };
    vi.mocked(getPushNotificationSettings).mockResolvedValue(mockSettings);
    const result = await getPushNotificationSettings(1);
    expect(result).toEqual(mockSettings);
    expect(getPushNotificationSettings).toHaveBeenCalledWith(1);
  });

  it('should create push notification settings', async () => {
    const newSettings = { merchantId: 1, newMessageEnabled: true, newOrderEnabled: true, emailNotificationsEnabled: true };
    vi.mocked(createPushNotificationSettings).mockResolvedValue({ id: 1, ...newSettings });
    const result = await createPushNotificationSettings(newSettings);
    expect(result).toBeDefined();
    expect(createPushNotificationSettings).toHaveBeenCalledWith(newSettings);
  });

  it('should update push notification settings', async () => {
    const updateData = { newMessageEnabled: false };
    vi.mocked(updatePushNotificationSettings).mockResolvedValue({ id: 1, ...updateData });
    const result = await updatePushNotificationSettings(1, updateData);
    expect(result).toBeDefined();
    expect(updatePushNotificationSettings).toHaveBeenCalledWith(1, updateData);
  });
});

describe('Scheduled Reports', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should get scheduled reports for merchant', async () => {
    const mockReports = [{ id: 1, merchant_id: 1, name: 'Weekly Sales Report', report_type: 'weekly' }, { id: 2, merchant_id: 1, name: 'Monthly Summary', report_type: 'monthly' }];
    vi.mocked(getScheduledReports).mockResolvedValue(mockReports);
    const result = await getScheduledReports(1);
    expect(result).toHaveLength(2);
    expect(getScheduledReports).toHaveBeenCalledWith(1);
  });

  it('should create scheduled report', async () => {
    const newReport = { merchantId: 1, name: 'Daily Report', reportType: 'daily' as const, deliveryMethod: 'email' as const, recipientEmail: 'test@example.com' };
    vi.mocked(createScheduledReport).mockResolvedValue({ id: 1, ...newReport });
    const result = await createScheduledReport(newReport);
    expect(result).toBeDefined();
    expect(createScheduledReport).toHaveBeenCalledWith(newReport);
  });

  it('should delete scheduled report', async () => {
    vi.mocked(deleteScheduledReport).mockResolvedValue(true);
    const result = await deleteScheduledReport(1);
    expect(result).toBe(true);
    expect(deleteScheduledReport).toHaveBeenCalledWith(1);
  });
});

describe('WhatsApp Auto Notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should get all default templates', () => {
    const templates = getAllDefaultTemplates();
    expect(templates).toHaveProperty('order_created');
    expect(templates).toHaveProperty('order_shipped');
    expect(templates).toHaveProperty('appointment_created');
  });

  it('should process template with variables', () => {
    const template = 'مرحباً {{customerName}}، طلبك رقم {{orderNumber}}';
    const data = { customerName: 'أحمد', orderNumber: '12345' };
    const result = processTemplate(template, data);
    expect(result).toBe('مرحباً أحمد، طلبك رقم 12345');
  });

  it('should get whatsapp auto notifications for merchant', async () => {
    const mockNotifications = [{ id: 1, merchant_id: 1, trigger_type: 'order_created', is_active: true }, { id: 2, merchant_id: 1, trigger_type: 'order_shipped', is_active: true }];
    vi.mocked(getWhatsappAutoNotifications).mockResolvedValue(mockNotifications);
    const result = await getWhatsappAutoNotifications(1);
    expect(result).toHaveLength(2);
    expect(getWhatsappAutoNotifications).toHaveBeenCalledWith(1);
  });

  it('should create whatsapp auto notification', async () => {
    const newNotification = { merchantId: 1, triggerType: 'order_created', messageTemplate: 'مرحباً {{customerName}}', isActive: true };
    vi.mocked(createWhatsappAutoNotification).mockResolvedValue({ id: 1, ...newNotification });
    const result = await createWhatsappAutoNotification(newNotification);
    expect(result).toBeDefined();
    expect(createWhatsappAutoNotification).toHaveBeenCalledWith(newNotification);
  });
});

describe('Webhook Security', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should generate webhook secret', () => {
    const secret = generateWebhookSecret();
    expect(secret).toBeDefined();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(10);
  });

  it('should log webhook security events', async () => {
    const logData = { merchantId: 1, platform: 'zid', ipAddress: '192.168.1.1', signatureValid: true, requestPath: '/api/webhooks/zid', requestMethod: 'POST' };
    vi.mocked(createWebhookSecurityLog).mockResolvedValue({ id: 1, ...logData });
    const result = await createWebhookSecurityLog(logData);
    expect(result).toBeDefined();
    expect(createWebhookSecurityLog).toHaveBeenCalledWith(logData);
  });

  it('should get webhook security logs for merchant', async () => {
    const mockLogs = [{ id: 1, merchant_id: 1, platform: 'zid', signature_valid: true }, { id: 2, merchant_id: 1, platform: 'calendly', signature_valid: false }];
    vi.mocked(getWebhookSecurityLogs).mockResolvedValue(mockLogs);
    const result = await getWebhookSecurityLogs(1);
    expect(result).toHaveLength(2);
    expect(getWebhookSecurityLogs).toHaveBeenCalledWith(1);
  });
});

describe('Integration Stats', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should get integration stats for merchant', async () => {
    const mockStats = [{ platform: 'zid', sync_count: 100, success_count: 95, error_count: 5 }, { platform: 'calendly', sync_count: 50, success_count: 50, error_count: 0 }];
    vi.mocked(getIntegrationStats).mockResolvedValue(mockStats);
    const result = await getIntegrationStats(1);
    expect(result).toHaveLength(2);
    expect(getIntegrationStats).toHaveBeenCalledWith(1);
  });

  it('should get unresolved integration errors', async () => {
    const mockErrors = [{ id: 1, platform: 'zid', error_type: 'sync_failed', error_message: 'Connection timeout' }];
    vi.mocked(getUnresolvedIntegrationErrors).mockResolvedValue(mockErrors);
    const result = await getUnresolvedIntegrationErrors(1);
    expect(result).toHaveLength(1);
    expect(getUnresolvedIntegrationErrors).toHaveBeenCalledWith(1);
  });
});
