/**
 * اختبارات نظام الإشعارات البريدية
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWelcomeEmail, sendUsageWarningEmail, sendSubscriptionExpiryEmail } from './email-notifications';
import * as emailSender from '../reports/email-sender';

// Mock email sender
vi.mock('../reports/email-sender', () => ({
  sendEmail: vi.fn(),
}));

describe('Email Notifications System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email successfully', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const result = await sendWelcomeEmail(
        'test@example.com',
        'متجر الاختبار',
        'أحمد'
      );

      expect(result).toBe(true);
      expect(emailSender.sendEmail).toHaveBeenCalledOnce();
      
      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.to).toBe('test@example.com');
      expect(callArgs.subject).toContain('مرحباً بك في ساري');
      expect(callArgs.html).toContain('أحمد');
      expect(callArgs.html).toContain('ساري');
    });

    it('should include all welcome features in email', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendWelcomeEmail('test@example.com', 'متجر الاختبار', 'أحمد');

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.html).toContain('الرد التلقائي الذكي');
      expect(callArgs.html).toContain('إدارة المنتجات');
      expect(callArgs.html).toContain('تقارير وإحصائيات');
      expect(callArgs.html).toContain('حملات تسويقية');
    });

    it('should include next steps in welcome email', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendWelcomeEmail('test@example.com', 'متجر الاختبار', 'أحمد');

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.html).toContain('ربط الواتساب');
      expect(callArgs.html).toContain('إضافة المنتجات');
      expect(callArgs.html).toContain('تفعيل الرد التلقائي');
      expect(callArgs.html).toContain('إطلاق أول حملة');
    });

    it('should handle email sending failure', async () => {
      vi.mocked(emailSender.sendEmail).mockRejectedValue(new Error('SMTP error'));

      const result = await sendWelcomeEmail(
        'test@example.com',
        'متجر الاختبار',
        'أحمد'
      );

      expect(result).toBe(false);
    });
  });

  describe('sendUsageWarningEmail', () => {
    it('should send usage warning email for conversations', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const result = await sendUsageWarningEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        480,
        600,
        'conversations'
      );

      expect(result).toBe(true);
      expect(emailSender.sendEmail).toHaveBeenCalledOnce();
      
      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.to).toBe('test@example.com');
      expect(callArgs.subject).toContain('تنبيه');
      expect(callArgs.subject).toContain('80%');
      expect(callArgs.html).toContain('متجر الاختبار');
      expect(callArgs.html).toContain('الباقة الاحترافية');
      expect(callArgs.html).toContain('480');
      expect(callArgs.html).toContain('600');
    });

    it('should send usage warning email for voice messages', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const result = await sendUsageWarningEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة المبتدئة',
        40,
        50,
        'voice_messages'
      );

      expect(result).toBe(true);
      
      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.subject).toContain('الرسائل الصوتية');
      expect(callArgs.html).toContain('40');
      expect(callArgs.html).toContain('50');
    });

    it('should calculate percentage correctly', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendUsageWarningEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        570,
        600,
        'conversations'
      );

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.subject).toContain('95%');
    });

    it('should include upgrade CTA button', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendUsageWarningEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة المبتدئة',
        120,
        150,
        'conversations'
      );

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.html).toContain('ترقية الباقة الآن');
      expect(callArgs.html).toContain('/merchant/subscriptions');
    });

    it('should handle email sending failure', async () => {
      vi.mocked(emailSender.sendEmail).mockRejectedValue(new Error('SMTP error'));

      const result = await sendUsageWarningEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        480,
        600,
        'conversations'
      );

      expect(result).toBe(false);
    });
  });

  describe('sendSubscriptionExpiryEmail', () => {
    it('should send subscription expiry email', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

      const result = await sendSubscriptionExpiryEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        expiryDate
      );

      expect(result).toBe(true);
      expect(emailSender.sendEmail).toHaveBeenCalledOnce();
      
      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.to).toBe('test@example.com');
      expect(callArgs.subject).toContain('تنبيه');
      expect(callArgs.subject).toContain('ينتهي خلال');
      expect(callArgs.html).toContain('متجر الاختبار');
      expect(callArgs.html).toContain('الباقة الاحترافية');
    });

    it('should include expiry date in email', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const expiryDate = new Date('2025-12-31');

      await sendSubscriptionExpiryEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        expiryDate
      );

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.html).toContain('2025');
    });

    it('should include what happens after expiry', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      await sendSubscriptionExpiryEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        expiryDate
      );

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.html).toContain('إيقاف الرد التلقائي');
      expect(callArgs.html).toContain('حملات تسويقية');
      expect(callArgs.html).toContain('التقارير والإحصائيات');
    });

    it('should include renewal and upgrade buttons', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      await sendSubscriptionExpiryEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        expiryDate
      );

      const callArgs = vi.mocked(emailSender.sendEmail).mock.calls[0][0];
      expect(callArgs.html).toContain('تجديد الاشتراك');
      expect(callArgs.html).toContain('ترقية الباقة');
      expect(callArgs.html).toContain('/merchant/subscriptions');
    });

    it('should handle email sending failure', async () => {
      vi.mocked(emailSender.sendEmail).mockRejectedValue(new Error('SMTP error'));

      const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const result = await sendSubscriptionExpiryEmail(
        'test@example.com',
        'متجر الاختبار',
        'الباقة الاحترافية',
        expiryDate
      );

      expect(result).toBe(false);
    });
  });

  describe('Email Template Quality', () => {
    it('should include Sari branding in all emails', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendWelcomeEmail('test@example.com', 'متجر الاختبار', 'أحمد');
      await sendUsageWarningEmail('test@example.com', 'متجر الاختبار', 'الباقة', 80, 100, 'conversations');
      await sendSubscriptionExpiryEmail('test@example.com', 'متجر الاختبار', 'الباقة', new Date());

      const calls = vi.mocked(emailSender.sendEmail).mock.calls;
      
      calls.forEach(call => {
        const html = call[0].html;
        expect(html).toContain('#00d25e'); // Sari brand color
        expect(html).toContain('ساري'); // Sari name
      });
    });

    it('should include social links footer in all emails', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendWelcomeEmail('test@example.com', 'متجر الاختبار', 'أحمد');
      await sendUsageWarningEmail('test@example.com', 'متجر الاختبار', 'الباقة', 80, 100, 'conversations');
      await sendSubscriptionExpiryEmail('test@example.com', 'متجر الاختبار', 'الباقة', new Date());

      const calls = vi.mocked(emailSender.sendEmail).mock.calls;
      
      calls.forEach(call => {
        const html = call[0].html;
        expect(html).toContain('wa.me');
        expect(html).toContain('twitter.com');
        expect(html).toContain('instagram.com');
        expect(html).toContain('support@sary.live');
        expect(html).toContain('sary.live');
      });
    });

    it('should use RTL direction in all emails', async () => {
      vi.mocked(emailSender.sendEmail).mockResolvedValue(true);

      await sendWelcomeEmail('test@example.com', 'متجر الاختبار', 'أحمد');
      await sendUsageWarningEmail('test@example.com', 'متجر الاختبار', 'الباقة', 80, 100, 'conversations');
      await sendSubscriptionExpiryEmail('test@example.com', 'متجر الاختبار', 'الباقة', new Date());

      const calls = vi.mocked(emailSender.sendEmail).mock.calls;
      
      calls.forEach(call => {
        const html = call[0].html;
        expect(html).toContain('dir="rtl"');
        expect(html).toContain('lang="ar"');
      });
    });
  });
});
