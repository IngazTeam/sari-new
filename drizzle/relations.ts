import { relations } from "drizzle-orm/relations";
import { merchants, abTestResults, quickResponses, botSettings, keywordAnalysis, notificationTemplates, orders, orderNotifications, users, passwordResetTokens, sariPersonalitySettings, scheduledMessages, messages, sentimentAnalysis, conversations, weeklySentimentReports, whatsappInstances, whatsappRequests, seoPages, seoMetaTags, seoOpenGraph, seoTwitterCards, seoStructuredData, seoTrackingCodes, seoAnalytics, seoKeywordsAnalysis, seoBacklinks, seoPerformanceAlerts, seoRecommendations, seoSitemaps } from "./schema";

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
	})
}));

// SEO Relations
export const seoPagesRelations = relations(seoPages, ({many}) => ({
	metaTags: many(seoMetaTags),
	openGraph: many(seoOpenGraph),
	twitterCards: many(seoTwitterCards),
	structuredData: many(seoStructuredData),
	trackingCodes: many(seoTrackingCodes),
	analytics: many(seoAnalytics),
	keywordsAnalysis: many(seoKeywordsAnalysis),
	backlinks: many(seoBacklinks),
	performanceAlerts: many(seoPerformanceAlerts),
	recommendations: many(seoRecommendations),
}));

export const seoMetaTagsRelations = relations(seoMetaTags, ({one}) => ({
	page: one(seoPages, {
		fields: [seoMetaTags.pageId],
		references: [seoPages.id]
	}),
}));

export const seoOpenGraphRelations = relations(seoOpenGraph, ({one}) => ({
	page: one(seoPages, {
		fields: [seoOpenGraph.pageId],
		references: [seoPages.id]
	}),
}));

export const seoTwitterCardsRelations = relations(seoTwitterCards, ({one}) => ({
	page: one(seoPages, {
		fields: [seoTwitterCards.pageId],
		references: [seoPages.id]
	}),
}));

export const seoStructuredDataRelations = relations(seoStructuredData, ({one}) => ({
	page: one(seoPages, {
		fields: [seoStructuredData.pageId],
		references: [seoPages.id]
	}),
}));

export const seoTrackingCodesRelations = relations(seoTrackingCodes, ({one}) => ({
	page: one(seoPages, {
		fields: [seoTrackingCodes.pageId],
		references: [seoPages.id]
	}),
}));

export const seoAnalyticsRelations = relations(seoAnalytics, ({one}) => ({
	page: one(seoPages, {
		fields: [seoAnalytics.pageId],
		references: [seoPages.id]
	}),
}));

export const seoKeywordsAnalysisRelations = relations(seoKeywordsAnalysis, ({one}) => ({
	page: one(seoPages, {
		fields: [seoKeywordsAnalysis.pageId],
		references: [seoPages.id]
	}),
}));

export const seoBacklinksRelations = relations(seoBacklinks, ({one}) => ({
	page: one(seoPages, {
		fields: [seoBacklinks.pageId],
		references: [seoPages.id]
	}),
}));

export const seoPerformanceAlertsRelations = relations(seoPerformanceAlerts, ({one}) => ({
	page: one(seoPages, {
		fields: [seoPerformanceAlerts.pageId],
		references: [seoPages.id]
	}),
}));

export const seoRecommendationsRelations = relations(seoRecommendations, ({one}) => ({
	page: one(seoPages, {
		fields: [seoRecommendations.pageId],
		references: [seoPages.id]
	}),
}));