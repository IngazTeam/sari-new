/**
 * Email Service
 * Handles sending emails via SMTP2GO API
 */

import { createEmailLog, updateEmailLogStatus } from '../db_smtp';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  type?: 'test' | 'notification' | 'invoice' | 'report' | 'custom';
  merchantId?: number;
  metadata?: Record<string, any>;
}

/**
 * Send email via SMTP2GO API
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.SMTP2GO_API_KEY;
    const fromEmail = process.env.SMTP_FROM || 'noreply@sary.live';

    if (!apiKey) {
      console.error('[Email] SMTP2GO_API_KEY not configured');
      return false;
    }

    // Create email log
    const logResult = await createEmailLog({
      recipient: options.to,
      subject: options.subject,
      body: options.html,
      status: 'pending',
      emailType: options.type || 'custom',
      merchantId: options.merchantId || null,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    });

    const logId = logResult.insertId;

    // Send via SMTP2GO API
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify({
        sender: fromEmail,
        to: [options.to],
        subject: options.subject,
        html_body: options.html,
      }),
    });

    const result = await response.json();

    if (response.ok && result.data?.succeeded > 0) {
      await updateEmailLogStatus(logId, 'sent');
      return true;
    } else {
      const error = result.data?.failures?.[0]?.error || 'Unknown error';
      await updateEmailLogStatus(logId, 'failed', error);
      console.error('[Email] Failed to send:', error);
      return false;
    }
  } catch (error) {
    console.error('[Email] Error:', error);
    return false;
  }
}
