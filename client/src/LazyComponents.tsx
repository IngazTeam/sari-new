/**
 * Lazy Loading Components
 * 
 * This file contains lazy-loaded versions of heavy components
 * to reduce initial bundle size and improve First Contentful Paint.
 * 
 * Usage: Import from this file instead of direct imports for better code splitting.
 * 
 * Note: This is a safe, non-breaking addition. The original imports still work.
 */

import { lazy, Suspense, ComponentType } from 'react';

// Loading fallback component
const PageLoader = () => (
    <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
);

// Helper to wrap lazy components with Suspense
export function withSuspense<T extends ComponentType<any>>(
    LazyComponent: React.LazyExoticComponent<T>
) {
    return (props: React.ComponentProps<T>) => (
        <Suspense fallback={<PageLoader />}>
            <LazyComponent {...props} />
        </Suspense>
    );
}

// ============================================
// Merchant Pages - Heavy Components
// ============================================

// Analytics (uses recharts - heavy)
export const LazyAnalyticsDashboard = lazy(() => import('./pages/merchant/AnalyticsDashboard'));
export const LazyAdvancedAnalytics = lazy(() => import('./pages/merchant/AdvancedAnalytics'));
export const LazyAdvancedAnalyticsDashboard = lazy(() => import('./pages/merchant/AdvancedAnalyticsDashboard'));
export const LazyOverviewAnalytics = lazy(() => import('./pages/merchant/OverviewAnalytics'));
export const LazyMetricsDashboard = lazy(() => import('./pages/merchant/MetricsDashboard'));
export const LazyPerformanceMetrics = lazy(() => import('./pages/merchant/PerformanceMetrics'));
export const LazyInsightsDashboard = lazy(() => import('./pages/merchant/InsightsDashboard'));

// WooCommerce (complex integration)
export const LazyWooCommerceSettings = lazy(() => import('./pages/merchant/WooCommerceSettings'));
export const LazyWooCommerceProducts = lazy(() => import('./pages/WooCommerceProducts'));
export const LazyWooCommerceOrders = lazy(() => import('./pages/WooCommerceOrders'));
export const LazyWooCommerceAnalytics = lazy(() => import('./pages/merchant/WooCommerceAnalytics'));

// Zid Integration
export const LazyZidIntegration = lazy(() => import('./pages/merchant/ZidIntegration'));
export const LazyZidSettings = lazy(() => import('./pages/ZidSettings'));
export const LazyZidProducts = lazy(() => import('./pages/ZidProducts'));
export const LazyZidSyncLogs = lazy(() => import('./pages/ZidSyncLogs'));

// Reports (data-heavy)
export const LazyReports = lazy(() => import('./pages/Reports'));
export const LazySheetsReports = lazy(() => import('./pages/SheetsReports'));

// Services & Bookings
export const LazyServicesManagement = lazy(() => import('./pages/merchant/ServicesManagement'));
export const LazyBookingsManagement = lazy(() => import('./pages/BookingsManagement'));
export const LazyServiceDetails = lazy(() => import('./pages/ServiceDetails'));

// Campaigns
export const LazyCampaigns = lazy(() => import('./pages/merchant/Campaigns'));
export const LazyCampaignDetails = lazy(() => import('./pages/merchant/CampaignDetails'));
export const LazyCampaignReport = lazy(() => import('./pages/merchant/CampaignReport'));
export const LazyOccasionCampaignsPage = lazy(() => import('./pages/merchant/OccasionCampaignsPage'));

// ============================================
// Admin Pages
// ============================================
export const LazyAdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
export const LazyMerchantsManagement = lazy(() => import('./pages/admin/Merchants'));
export const LazyMerchantDetails = lazy(() => import('./pages/admin/MerchantDetails'));
export const LazySubscriptionPlansAdmin = lazy(() => import('./pages/admin/SubscriptionPlans'));
export const LazySubscriptionReports = lazy(() => import('./pages/admin/SubscriptionReports'));
export const LazyEmailTemplates = lazy(() => import('./pages/admin/EmailTemplates'));
export const LazyAdminInvoices = lazy(() => import('./pages/admin/Invoices'));

// ============================================
// Public Heavy Pages
// ============================================
export const LazyTrySari = lazy(() => import('./pages/TrySari'));
// LazyTrySariEnhanced removed — merged into TrySari
export const LazySariPlayground = lazy(() => import('./pages/SariPlayground'));

// ============================================
// Wrapped Components (Ready to use)
// ============================================
export const AnalyticsDashboardLazy = withSuspense(LazyAnalyticsDashboard);
export const AdvancedAnalyticsLazy = withSuspense(LazyAdvancedAnalytics);
export const ReportsLazy = withSuspense(LazyReports);
export const AdminDashboardLazy = withSuspense(LazyAdminDashboard);
export const TrySariLazy = withSuspense(LazyTrySari);
