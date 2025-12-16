import { relations } from "drizzle-orm/relations";
import { merchants, abTestResults, quickResponses, botSettings, keywordAnalysis, notificationTemplates, orders, orderNotifications, users, passwordResetTokens, sariPersonalitySettings, scheduledMessages, messages, sentimentAnalysis, conversations, weeklySentimentReports, whatsappInstances, whatsappRequests } from "./schema";

export const abTestResultsRelations = relations(abTestResults, ({one}) => ({
	merchant: one(merchants, {
		fields: [abTestResults.merchantId],
		references: [merchants.id]
	}),
	quickResponse_variantAId: one(quickResponses, {
		fields: [abTestResults.variantAId],
		references: [quickResponses.id],
		relationName: "abTestResults_variantAId_quickResponses_id"
	}),
	quickResponse_variantBId: one(quickResponses, {
		fields: [abTestResults.variantBId],
		references: [quickResponses.id],
		relationName: "abTestResults_variantBId_quickResponses_id"
	}),
}));

export const merchantsRelations = relations(merchants, ({many}) => ({
	abTestResults: many(abTestResults),
	botSettings: many(botSettings),
	keywordAnalyses: many(keywordAnalysis),
	notificationTemplates: many(notificationTemplates),
	orderNotifications: many(orderNotifications),
	quickResponses: many(quickResponses),
	sariPersonalitySettings: many(sariPersonalitySettings),
	scheduledMessages: many(scheduledMessages),
	weeklySentimentReports: many(weeklySentimentReports),
	whatsappInstances: many(whatsappInstances),
	whatsappRequests: many(whatsappRequests),
}));

export const quickResponsesRelations = relations(quickResponses, ({one, many}) => ({
	abTestResults_variantAId: many(abTestResults, {
		relationName: "abTestResults_variantAId_quickResponses_id"
	}),
	abTestResults_variantBId: many(abTestResults, {
		relationName: "abTestResults_variantBId_quickResponses_id"
	}),
	merchant: one(merchants, {
		fields: [quickResponses.merchantId],
		references: [merchants.id]
	}),
}));

export const botSettingsRelations = relations(botSettings, ({one}) => ({
	merchant: one(merchants, {
		fields: [botSettings.merchantId],
		references: [merchants.id]
	}),
}));

export const keywordAnalysisRelations = relations(keywordAnalysis, ({one}) => ({
	merchant: one(merchants, {
		fields: [keywordAnalysis.merchantId],
		references: [merchants.id]
	}),
}));

export const notificationTemplatesRelations = relations(notificationTemplates, ({one}) => ({
	merchant: one(merchants, {
		fields: [notificationTemplates.merchantId],
		references: [merchants.id]
	}),
}));

export const orderNotificationsRelations = relations(orderNotifications, ({one}) => ({
	order: one(orders, {
		fields: [orderNotifications.orderId],
		references: [orders.id]
	}),
	merchant: one(merchants, {
		fields: [orderNotifications.merchantId],
		references: [merchants.id]
	}),
}));

export const ordersRelations = relations(orders, ({many}) => ({
	orderNotifications: many(orderNotifications),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	passwordResetTokens: many(passwordResetTokens),
}));

export const sariPersonalitySettingsRelations = relations(sariPersonalitySettings, ({one}) => ({
	merchant: one(merchants, {
		fields: [sariPersonalitySettings.merchantId],
		references: [merchants.id]
	}),
}));

export const scheduledMessagesRelations = relations(scheduledMessages, ({one}) => ({
	merchant: one(merchants, {
		fields: [scheduledMessages.merchantId],
		references: [merchants.id]
	}),
}));

export const sentimentAnalysisRelations = relations(sentimentAnalysis, ({one}) => ({
	message: one(messages, {
		fields: [sentimentAnalysis.messageId],
		references: [messages.id]
	}),
	conversation: one(conversations, {
		fields: [sentimentAnalysis.conversationId],
		references: [conversations.id]
	}),
}));

export const messagesRelations = relations(messages, ({many}) => ({
	sentimentAnalyses: many(sentimentAnalysis),
}));

export const conversationsRelations = relations(conversations, ({many}) => ({
	sentimentAnalyses: many(sentimentAnalysis),
}));

export const weeklySentimentReportsRelations = relations(weeklySentimentReports, ({one}) => ({
	merchant: one(merchants, {
		fields: [weeklySentimentReports.merchantId],
		references: [merchants.id]
	}),
}));

export const whatsappInstancesRelations = relations(whatsappInstances, ({one}) => ({
	merchant: one(merchants, {
		fields: [whatsappInstances.merchantId],
		references: [merchants.id]
	}),
}));

export const whatsappRequestsRelations = relations(whatsappRequests, ({one}) => ({
	merchant: one(merchants, {
		fields: [whatsappRequests.merchantId],
		references: [merchants.id]
	}),
}));