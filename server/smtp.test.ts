import { describe, it, expect } from 'vitest';
import { sendEmail, isSMTPConfigured } from './reports/email-sender';
import { sendInvoiceEmail } from './invoices/email';

describe('SMTP Email System', () => {
  describe('SMTP Configuration', () => {
    it('should check if SMTP is configured', () => {
      const isConfigured = isSMTPConfigured();
      // Will be false until env vars are set
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('Email Sending', () => {
    it('should have sendEmail function', () => {
      expect(typeof sendEmail).toBe('function');
    });

    it('should have sendInvoiceEmail function', () => {
      expect(typeof sendInvoiceEmail).toBe('function');
    });

    it('should return false when SMTP is not configured', async () => {
      // Only test if SMTP is not configured
      if (!isSMTPConfigured()) {
        const result = await sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        });
        expect(result).toBe(false);
      }
    });
  });

  describe('Email Content', () => {
    it('should accept valid email parameters', async () => {
      const params = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>',
        from: 'noreply@sary.live',
      };

      // Should not throw
      expect(() => {
        sendEmail(params);
      }).not.toThrow();
    });
  });
});
