/**
 * Tap Payment Integration
 * 
 * This module provides integration with Tap Payment Gateway for processing payments.
 * Tap is a popular payment gateway in the Middle East region.
 * 
 * Documentation: https://developers.tap.company/reference
 */

import { db } from "../db";

// ============================================
// Types
// ============================================

export interface TapChargeRequest {
	amount: number;
	currency: string;
	customer: {
		first_name?: string;
		last_name?: string;
		email?: string;
		phone?: {
			country_code: string;
			number: string;
		};
	};
	source: {
		id: string; // 'src_all' for all payment methods
	};
	redirect: {
		url: string; // Redirect URL after payment
	};
	post?: {
		url: string; // Webhook URL for payment notifications
	};
	description?: string;
	metadata?: Record<string, any>;
	receipt?: {
		email: boolean;
		sms: boolean;
	};
}

export interface TapChargeResponse {
	id: string;
	object: string;
	live_mode: boolean;
	amount: number;
	currency: string;
	status: 'INITIATED' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
	transaction?: {
		timezone: string;
		created: string;
		url: string;
		expiry: {
			period: number;
			type: string;
		};
		asynchronous: boolean;
		amount: number;
		currency: string;
	};
	customer: {
		id: string;
		first_name: string;
		last_name: string;
		email: string;
		phone: {
			country_code: string;
			number: string;
		};
	};
	source: {
		id: string;
		object: string;
		type: string;
		payment_type: string;
		payment_method: string;
	};
	redirect: {
		status: string;
		url: string;
	};
	post?: {
		status: string;
		url: string;
	};
	response: {
		code: string;
		message: string;
	};
	receipt?: {
		email: boolean;
		sms: boolean;
	};
	metadata?: Record<string, any>;
}

export interface TapRefundRequest {
	charge_id: string;
	amount: number;
	currency: string;
	reason?: string;
	metadata?: Record<string, any>;
	post?: {
		url: string;
	};
}

export interface TapRefundResponse {
	id: string;
	object: string;
	live_mode: boolean;
	amount: number;
	currency: string;
	charge: string;
	status: 'PENDING' | 'CAPTURED' | 'FAILED';
	response: {
		code: string;
		message: string;
	};
	metadata?: Record<string, any>;
}

// ============================================
// Get Tap Settings
// ============================================

async function getTapSettings() {
	const settings = await db.getTapSettings();

	if (!settings) {
		throw new Error('Tap settings not configured. Please configure Tap settings in admin panel.');
	}

	if (!settings.isActive) {
		throw new Error('Tap payment gateway is currently disabled.');
	}

	return settings;
}

// ============================================
// Get API Base URL
// ============================================

function getApiBaseUrl(isLive: boolean): string {
	return isLive
		? 'https://api.tap.company/v2'
		: 'https://api.tap.company/v2'; // Tap uses same URL for both
}

// ============================================
// Create Charge
// ============================================

/**
 * Create a new charge (payment) in Tap
 * 
 * @param request - Charge request data
 * @returns Charge response from Tap
 */
export async function createCharge(request: TapChargeRequest): Promise<TapChargeResponse> {
	const settings = await getTapSettings();
	const baseUrl = getApiBaseUrl(settings.isLive);

	try {
		const response = await fetch(`${baseUrl}/charges`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${settings.secretKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(`Tap API Error: ${errorData.message || response.statusText}`);
		}

		const data: TapChargeResponse = await response.json();
		return data;
	} catch (error) {
		console.error('[Tap] Create charge error:', error);
		throw error;
	}
}

// ============================================
// Retrieve Charge
// ============================================

/**
 * Retrieve charge details from Tap
 * 
 * @param chargeId - Tap charge ID
 * @returns Charge details
 */
export async function retrieveCharge(chargeId: string): Promise<TapChargeResponse> {
	const settings = await getTapSettings();
	const baseUrl = getApiBaseUrl(settings.isLive);

	try {
		const response = await fetch(`${baseUrl}/charges/${chargeId}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${settings.secretKey}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(`Tap API Error: ${errorData.message || response.statusText}`);
		}

		const data: TapChargeResponse = await response.json();
		return data;
	} catch (error) {
		console.error('[Tap] Retrieve charge error:', error);
		throw error;
	}
}

// ============================================
// Refund Charge
// ============================================

/**
 * Refund a charge in Tap
 * 
 * @param request - Refund request data
 * @returns Refund response from Tap
 */
export async function refundCharge(request: TapRefundRequest): Promise<TapRefundResponse> {
	const settings = await getTapSettings();
	const baseUrl = getApiBaseUrl(settings.isLive);

	try {
		const response = await fetch(`${baseUrl}/refunds`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${settings.secretKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(`Tap API Error: ${errorData.message || response.statusText}`);
		}

		const data: TapRefundResponse = await response.json();
		return data;
	} catch (error) {
		console.error('[Tap] Refund charge error:', error);
		throw error;
	}
}

// ============================================
// Verify Webhook Signature
// ============================================

/**
 * Verify webhook signature from Tap
 * 
 * @param payload - Webhook payload
 * @param signature - Webhook signature from headers
 * @returns True if signature is valid
 */
export async function verifyWebhook(payload: string, signature: string): Promise<boolean> {
	const settings = await getTapSettings();

	if (!settings.webhookSecret) {
		console.error('[Tap] Webhook secret not configured — rejecting webhook for security');
		return false; // SECURITY: Never allow unverified webhooks
	}

	try {
		// Tap uses HMAC SHA256 for webhook signature
		const crypto = await import('node:crypto');
		const expectedSignature = crypto
			.createHmac('sha256', settings.webhookSecret)
			.update(payload)
			.digest('hex');

		return signature === expectedSignature;
	} catch (error) {
		console.error('[Tap] Webhook verification error:', error);
		return false;
	}
}

// ============================================
// Test Connection
// ============================================

/**
 * Test connection to Tap API
 * 
 * @returns True if connection is successful
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
	try {
		const settings = await getTapSettings();
		const baseUrl = getApiBaseUrl(settings.isLive);

		// Try to retrieve a charge (will fail if no charges exist, but will confirm API key is valid)
		const response = await fetch(`${baseUrl}/charges?limit=1`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${settings.secretKey}`,
				'Content-Type': 'application/json',
			},
		});

		if (response.ok) {
			return {
				success: true,
				message: 'Connection to Tap API successful',
			};
		} else {
			const errorData = await response.json();
			return {
				success: false,
				message: `Connection failed: ${errorData.message || response.statusText}`,
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}
