import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { lazy, Suspense } from "react";

// Essential pages - loaded immediately (fast initial load)
import Home from "./pages/Home";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

// Lazy wrapper helper
const lazyLoad = (importFn: () => Promise<{ default: React.ComponentType<any> }>) => {
  const LazyComponent = lazy(importFn);
  return (props: any) => (
    <Suspense fallback={<PageLoader />}>
      <LazyComponent {...props} />
    </Suspense>
  );
};

// Public pages - lazy loaded
const ForgotPassword = lazyLoad(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyLoad(() => import("./pages/ResetPassword"));
const ProductsPage = lazyLoad(() => import("./pages/Products"));
const PricingPage = lazyLoad(() => import("./pages/Pricing"));
const SupportPage = lazyLoad(() => import("./pages/Support"));
const SolutionsSales = lazyLoad(() => import("./pages/SolutionsSales"));
const SolutionsMarketing = lazyLoad(() => import("./pages/SolutionsMarketing"));
const SolutionsSupport = lazyLoad(() => import("./pages/SolutionsSupport"));
const ProductAI = lazyLoad(() => import("./pages/ProductAI"));
const CompanyAbout = lazyLoad(() => import("./pages/CompanyAbout"));
const Blog = lazyLoad(() => import("./pages/resources/Blog"));
const HelpCenter = lazyLoad(() => import("./pages/resources/HelpCenter"));
const SuccessStories = lazyLoad(() => import("./pages/resources/SuccessStories"));
const Contact = lazyLoad(() => import("./pages/company/Contact"));
const Terms = lazyLoad(() => import("./pages/company/Terms"));
const Privacy = lazyLoad(() => import("./pages/company/Privacy"));
const TrySari = lazyLoad(() => import("./pages/TrySari"));
const TrySariEnhanced = lazyLoad(() => import("./pages/TrySariEnhanced"));
const SubscribePage = lazyLoad(() => import("./pages/SubscribePage"));
const PaymentCallback = lazyLoad(() => import("./pages/PaymentCallback"));

// Merchant pages - lazy loaded
const MerchantDashboard = lazyLoad(() => import("./pages/merchant/Dashboard"));
const Campaigns = lazyLoad(() => import("./pages/merchant/Campaigns"));
const NewCampaign = lazyLoad(() => import("./pages/merchant/NewCampaign"));
const CampaignDetails = lazyLoad(() => import("./pages/merchant/CampaignDetails"));
const CampaignReport = lazyLoad(() => import("./pages/merchant/CampaignReport"));
const Products = lazyLoad(() => import("./pages/merchant/Products"));
const UploadProducts = lazyLoad(() => import("./pages/merchant/UploadProducts"));
const Conversations = lazyLoad(() => import("./pages/merchant/Conversations"));
const WhatsApp = lazyLoad(() => import("./pages/merchant/WhatsApp"));
const SallaIntegration = lazyLoad(() => import("./pages/SallaIntegration"));
const ChatOrders = lazyLoad(() => import("./pages/ChatOrders"));
const DiscountCodes = lazyLoad(() => import("./pages/DiscountCodes"));
const Referrals = lazyLoad(() => import("./pages/merchant/Referrals"));
const MerchantSettings = lazyLoad(() => import("./pages/merchant/Settings"));
const LanguageSettings = lazyLoad(() => import("./pages/merchant/LanguageSettings"));
const Reports = lazyLoad(() => import("./pages/Reports"));
const Subscriptions = lazyLoad(() => import("./pages/merchant/Subscriptions"));
const Usage = lazyLoad(() => import("./pages/merchant/Usage"));
const Checkout = lazyLoad(() => import("./pages/merchant/Checkout"));
const PaymentSuccess = lazyLoad(() => import("./pages/merchant/PaymentSuccess"));
const PaymentCancel = lazyLoad(() => import("./pages/merchant/PaymentCancel"));
const AbandonedCartsPage = lazyLoad(() => import("./pages/merchant/AbandonedCartsPage"));
const OccasionCampaignsPage = lazyLoad(() => import("./pages/merchant/OccasionCampaignsPage"));
const AnalyticsDashboard = lazyLoad(() => import("./pages/merchant/AnalyticsDashboard"));
const Analytics = lazyLoad(() => import("./pages/merchant/Analytics"));
const OverviewAnalytics = lazyLoad(() => import("./pages/merchant/OverviewAnalytics"));
const Orders = lazyLoad(() => import("./pages/Orders"));
const WhatsAppInstancesPage = lazyLoad(() => import("./pages/merchant/WhatsAppInstancesPage"));
const WhatsAppSetupWizard = lazyLoad(() => import("./pages/merchant/WhatsAppSetupWizard"));
const OrderNotificationsSettings = lazyLoad(() => import("./pages/merchant/OrderNotificationsSettings"));
const WhatsAppTest = lazyLoad(() => import("./pages/merchant/WhatsAppTest"));
const GreenAPISetupGuide = lazyLoad(() => import("./pages/merchant/GreenAPISetupGuide"));
const Reviews = lazyLoad(() => import("./pages/merchant/Reviews"));
const BookingReviews = lazyLoad(() => import("./pages/merchant/BookingReviews"));
const TestSari = lazyLoad(() => import("./pages/merchant/TestSari"));
const MetricsDashboard = lazyLoad(() => import("./pages/merchant/MetricsDashboard"));
const SariPlayground = lazyLoad(() => import("./pages/SariPlayground"));
const SariAnalytics = lazyLoad(() => import("./pages/SariAnalytics"));
const WhatsAppWebhookSetup = lazyLoad(() => import("./pages/merchant/WhatsAppWebhookSetup"));
const BotSettings = lazyLoad(() => import("./pages/merchant/BotSettings"));
const ScheduledMessages = lazyLoad(() => import("./pages/merchant/ScheduledMessages"));
const SariPersonality = lazyLoad(() => import("./pages/merchant/SariPersonality"));
const QuickResponses = lazyLoad(() => import("./pages/merchant/QuickResponses"));
const InsightsDashboard = lazyLoad(() => import("./pages/merchant/InsightsDashboard"));
const AdvancedAnalytics = lazyLoad(() => import("./pages/merchant/AdvancedAnalytics"));
const AdvancedAnalyticsDashboard = lazyLoad(() => import("./pages/merchant/AdvancedAnalyticsDashboard"));
const DataSync = lazyLoad(() => import("./pages/merchant/DataSync"));
const PerformanceMetrics = lazyLoad(() => import("./pages/merchant/PerformanceMetrics"));
const ZidIntegration = lazyLoad(() => import("./pages/merchant/ZidIntegration"));
const ZidSettings = lazyLoad(() => import("./pages/ZidSettings"));
const ZidCallback = lazyLoad(() => import("./pages/ZidCallback"));
const ZidProducts = lazyLoad(() => import("./pages/ZidProducts"));
const ZidSyncLogs = lazyLoad(() => import("./pages/ZidSyncLogs"));
const WooCommerceSettings = lazyLoad(() => import("./pages/merchant/WooCommerceSettings"));
const WooCommerceProducts = lazyLoad(() => import("./pages/WooCommerceProducts"));
const WooCommerceOrders = lazyLoad(() => import("./pages/WooCommerceOrders"));
const WooCommerceAnalytics = lazyLoad(() => import("./pages/merchant/WooCommerceAnalytics"));
const CalendlyIntegration = lazyLoad(() => import("./pages/merchant/CalendlyIntegration"));
const SetupWizard = lazyLoad(() => import("./pages/SetupWizard"));
const CalendarSettings = lazyLoad(() => import("./pages/CalendarSettings"));
const CalendarPage = lazyLoad(() => import("./pages/CalendarPage"));
const StaffManagement = lazyLoad(() => import("./pages/StaffManagement"));
const ServicesManagement = lazyLoad(() => import("./pages/merchant/ServicesManagement"));
const ServiceForm = lazyLoad(() => import("./pages/merchant/ServiceForm"));
const ServiceCategories = lazyLoad(() => import("./pages/merchant/ServiceCategories"));
const ServicePackages = lazyLoad(() => import("./pages/merchant/ServicePackages"));
const ServiceDetails = lazyLoad(() => import("./pages/ServiceDetails"));
const BookingsManagement = lazyLoad(() => import("./pages/BookingsManagement"));
const SheetsSettings = lazyLoad(() => import("./pages/SheetsSettings"));
const SheetsExport = lazyLoad(() => import("./pages/SheetsExport"));
const SheetsReports = lazyLoad(() => import("./pages/SheetsReports"));
const SheetsInventory = lazyLoad(() => import("./pages/SheetsInventory"));
const Payments = lazyLoad(() => import("./pages/merchant/Payments"));
const PaymentLinks = lazyLoad(() => import("./pages/merchant/PaymentLinks"));
const PaymentSettings = lazyLoad(() => import("./pages/merchant/PaymentSettings"));
const PaymentDetails = lazyLoad(() => import("./pages/PaymentDetails"));
const LoyaltySettings = lazyLoad(() => import("./pages/LoyaltySettings"));
const LoyaltyTiers = lazyLoad(() => import("./pages/LoyaltyTiers"));
const LoyaltyRewards = lazyLoad(() => import("./pages/LoyaltyRewards"));
const LoyaltyCustomers = lazyLoad(() => import("./pages/LoyaltyCustomers"));
const CustomerLoyalty = lazyLoad(() => import("./pages/CustomerLoyalty"));
const IntegrationsDashboard = lazyLoad(() => import("./pages/IntegrationsDashboard"));
const NotificationSettings = lazyLoad(() => import("./pages/NotificationSettings"));
const CurrencySettings = lazyLoad(() => import("./pages/CurrencySettings"));
const PushNotificationsSettings = lazyLoad(() => import("./pages/merchant/PushNotificationsSettings"));
const NotificationsPage = lazyLoad(() => import("./pages/merchant/NotificationsPage"));
const ScheduledReports = lazyLoad(() => import("./pages/ScheduledReports"));
const WhatsAppAutoNotifications = lazyLoad(() => import("./pages/WhatsAppAutoNotifications"));
const CustomersManagement = lazyLoad(() => import("./pages/CustomersManagement"));
const Customers = lazyLoad(() => import("./pages/Customers"));
const CustomerDetails = lazyLoad(() => import("./pages/CustomerDetails"));
const WebsiteAnalysis = lazyLoad(() => import("./pages/WebsiteAnalysis"));
const CompetitorAnalysis = lazyLoad(() => import("./pages/CompetitorAnalysis"));
const SmartAnalysis = lazyLoad(() => import("./pages/SmartAnalysis"));

// Admin pages - lazy loaded
const AdminDashboard = lazyLoad(() => import("./pages/admin/Dashboard"));
const MerchantsManagement = lazyLoad(() => import("./pages/admin/Merchants"));
const MerchantDetails = lazyLoad(() => import("./pages/admin/MerchantDetails"));
const AdminSettings = lazyLoad(() => import("./pages/admin/Settings"));
const WhatsAppRequests = lazyLoad(() => import("./pages/admin/WhatsAppRequests"));
const WhatsAppRequestsPage = lazyLoad(() => import("./pages/admin/WhatsAppRequestsPage"));
const PaymentGateways = lazyLoad(() => import("./pages/admin/PaymentGateways"));
const AdminCampaigns = lazyLoad(() => import("./pages/admin/Campaigns"));
const SMTPSettings = lazyLoad(() => import("./pages/superadmin/SmtpSettings"));
const SeoUnified = lazyLoad(() => import("./pages/admin/SeoUnified"));
const AdminRecommendations = lazyLoad(() => import("./pages/admin/AdminRecommendations"));
const RecommendationsAnalytics = lazyLoad(() => import("./pages/admin/RecommendationsAnalytics"));
const AdminGoogleOAuth = lazyLoad(() => import("./pages/AdminGoogleOAuth"));
const AdminDataSync = lazyLoad(() => import("./pages/AdminDataSync"));
const SubscriptionPlansAdmin = lazyLoad(() => import("./pages/admin/SubscriptionPlans"));
const SubscriptionAddonsAdmin = lazyLoad(() => import("./pages/admin/SubscriptionAddons"));
const TapSettings = lazyLoad(() => import("./pages/admin/TapSettings"));
const SubscriptionPlansMerchant = lazyLoad(() => import("./pages/merchant/SubscriptionPlans"));
const MySubscription = lazyLoad(() => import("./pages/merchant/MySubscription"));
const ComparePlans = lazyLoad(() => import("./pages/ComparePlans"));
const UsageDashboard = lazyLoad(() => import("./pages/merchant/UsageDashboard"));
const GlobalSeoSettings = lazyLoad(() => import("./pages/admin/GlobalSeoSettings"));
const GoogleOAuthSettings = lazyLoad(() => import("./pages/admin/GoogleOAuthSettings"));
const AdminABTestDashboard = lazyLoad(() => import("./pages/AdminABTestDashboard"));
const PlatformIntegrations = lazyLoad(() => import("./pages/PlatformIntegrations"));
const NotificationDashboard = lazyLoad(() => import("./pages/super-admin/NotificationDashboard"));
const EmailTemplates = lazyLoad(() => import("./pages/admin/EmailTemplates"));
const TemplateTranslations = lazyLoad(() => import("./pages/admin/TemplateTranslations"));
const SubscriptionReports = lazyLoad(() => import("./pages/admin/SubscriptionReports"));
const AdminInvoices = lazyLoad(() => import("./pages/admin/Invoices"));

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={SignUp} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/subscribe" component={SubscribePage} />
      <Route path="/subscribe/:planId" component={SubscribePage} />
      <Route path="/payment/callback" component={PaymentCallback} />
      <Route path="/support" component={SupportPage} />
      <Route path="/solutions/sales" component={SolutionsSales} />
      <Route path="/solutions/marketing" component={SolutionsMarketing} />
      <Route path="/solutions/support" component={SolutionsSupport} />
      <Route path="/product/ai-agent" component={ProductAI} />
      <Route path="/company/about" component={CompanyAbout} />
      <Route path="/resources/blog" component={Blog} />
      <Route path="/resources/help-center" component={HelpCenter} />
      <Route path="/resources/success-stories" component={SuccessStories} />
      <Route path="/company/contact" component={Contact} />
      <Route path="/company/terms" component={Terms} />
      <Route path="/company/privacy" component={Privacy} />
      <Route path="/try-sari" component={TrySari} />
      <Route path="/try-sari-enhanced" component={TrySariEnhanced} />
      <Route path="/setup-wizard" component={SetupWizard} />

      {/* Merchant Routes */}
      <Route path="/merchant/dashboard">
        <DashboardLayout>
          <MerchantDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/campaigns">
        <DashboardLayout>
          <Campaigns />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/campaigns/new">
        <DashboardLayout>
          <NewCampaign />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/campaigns/:id">
        <DashboardLayout>
          <CampaignDetails />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/campaigns/:id/report">
        <DashboardLayout>
          <CampaignReport />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/products">
        <DashboardLayout>
          <Products />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/products/upload">
        <DashboardLayout>
          <UploadProducts />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/conversations">
        <DashboardLayout>
          <Conversations />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/whatsapp">
        <DashboardLayout>
          <WhatsApp />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/salla">
        <DashboardLayout>
          <SallaIntegration />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/integrations/zid">
        <DashboardLayout>
          <ZidIntegration />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/zid/settings">
        <DashboardLayout>
          <ZidSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/zid/callback">
        <ZidCallback />
      </Route>

      <Route path="/merchant/zid/products">
        <DashboardLayout>
          <ZidProducts />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/zid/sync-logs">
        <DashboardLayout>
          <ZidSyncLogs />
        </DashboardLayout>
      </Route>

      {/* WooCommerce Routes */}
      <Route path="/merchant/woocommerce/settings">
        <DashboardLayout>
          <WooCommerceSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/woocommerce/products">
        <DashboardLayout>
          <WooCommerceProducts />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/woocommerce/orders">
        <DashboardLayout>
          <WooCommerceOrders />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/woocommerce/analytics">
        <DashboardLayout>
          <WooCommerceAnalytics />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/integrations/calendly">
        <DashboardLayout>
          <CalendlyIntegration />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/chat-orders">
        <DashboardLayout>
          <ChatOrders />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/discounts">
        <DashboardLayout>
          <DiscountCodes />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/referrals">
        <DashboardLayout>
          <Referrals />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/abandoned-carts">
        <DashboardLayout>
          <AbandonedCartsPage />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/occasion-campaigns">
        <DashboardLayout>
          <OccasionCampaignsPage />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/analytics">
        <DashboardLayout>
          <AnalyticsDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/message-analytics">
        <DashboardLayout>
          <Analytics />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/overview-analytics">
        <DashboardLayout>
          <OverviewAnalytics />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/orders">
        <DashboardLayout>
          <Orders />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/whatsapp-instances">
        <DashboardLayout>
          <WhatsAppInstancesPage />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/whatsapp-setup">
        <DashboardLayout>
          <WhatsAppSetupWizard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/whatsapp-test">
        <DashboardLayout>
          <WhatsAppTest />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/greenapi-setup">
        <DashboardLayout>
          <GreenAPISetupGuide />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/test-sari">
        <DashboardLayout>
          <TestSari />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/metrics-dashboard">
        <DashboardLayout>
          <MetricsDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/whatsapp-webhook-setup">
        <DashboardLayout>
          <WhatsAppWebhookSetup />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/bot-settings">
        <DashboardLayout>
          <BotSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/sari-playground">
        <DashboardLayout>
          <SariPlayground />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/sari-analytics">
        <DashboardLayout>
          <SariAnalytics />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/scheduled-messages">
        <DashboardLayout>
          <ScheduledMessages />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/sari-personality">
        <DashboardLayout>
          <SariPersonality />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/quick-responses">
        <DashboardLayout>
          <QuickResponses />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/insights">
        <DashboardLayout>
          <InsightsDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/advanced-analytics">
        <DashboardLayout>
          <AdvancedAnalytics />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/analytics-dashboard">
        <DashboardLayout>
          <AdvancedAnalyticsDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/performance-metrics">
        <DashboardLayout>
          <PerformanceMetrics />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/data-sync">
        <DashboardLayout>
          <DataSync />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/reviews">
        <DashboardLayout>
          <Reviews />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/booking-reviews">
        <DashboardLayout>
          <BookingReviews />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/order-notifications">
        <DashboardLayout>
          <OrderNotificationsSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/settings">
        <DashboardLayout>
          <MerchantSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/notifications">
        <DashboardLayout>
          <NotificationsPage />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/language-settings">
        <DashboardLayout>
          <LanguageSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/calendar/settings">
        <DashboardLayout>
          <CalendarSettings />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/calendar">
        <DashboardLayout>
          <CalendarPage />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/staff">
        <DashboardLayout>
          <StaffManagement />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/services">
        <DashboardLayout>
          <ServicesManagement />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/services/new">
        <DashboardLayout>
          <ServiceForm />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/services/:id/edit">
        <DashboardLayout>
          <ServiceForm />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/services/:id">
        <DashboardLayout>
          <ServiceDetails />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/bookings">
        <DashboardLayout>
          <BookingsManagement />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/service-categories">
        <DashboardLayout>
          <ServiceCategories />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/service-packages">
        <DashboardLayout>
          <ServicePackages />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/sheets/settings">
        <SheetsSettings />
      </Route>

      <Route path="/merchant/sheets/export">
        <SheetsExport />
      </Route>

      <Route path="/merchant/sheets/reports">
        <SheetsReports />
      </Route>

      <Route path="/merchant/sheets/inventory">
        <SheetsInventory />
      </Route>

      <Route path="/merchant/payments">
        <DashboardLayout><Payments /></DashboardLayout>
      </Route>

      <Route path="/merchant/payments/:id">
        <DashboardLayout><PaymentDetails /></DashboardLayout>
      </Route>

      <Route path="/merchant/payment-links">
        <DashboardLayout><PaymentLinks /></DashboardLayout>
      </Route>

      <Route path="/merchant/payment-settings">
        <DashboardLayout><PaymentSettings /></DashboardLayout>
      </Route>

      {/* Loyalty System Routes */}
      <Route path="/merchant/loyalty/settings">
        <DashboardLayout><LoyaltySettings /></DashboardLayout>
      </Route>

      <Route path="/merchant/loyalty/tiers">
        <DashboardLayout><LoyaltyTiers /></DashboardLayout>
      </Route>

      <Route path="/merchant/loyalty/rewards">
        <DashboardLayout><LoyaltyRewards /></DashboardLayout>
      </Route>

      <Route path="/merchant/loyalty/customers">
        <DashboardLayout><LoyaltyCustomers /></DashboardLayout>
      </Route>

      {/* Customer Loyalty Page (Public) */}
      <Route path="/customer/loyalty/:customerPhone">
        <CustomerLoyalty />
      </Route>

      <Route path="/merchant/integrations-dashboard">
        <DashboardLayout><IntegrationsDashboard /></DashboardLayout>
      </Route>

      <Route path="/merchant/platform-integrations">
        <DashboardLayout><PlatformIntegrations /></DashboardLayout>
      </Route>

      <Route path="/merchant/notification-settings">
        <DashboardLayout><NotificationSettings /></DashboardLayout>
      </Route>

      <Route path="/merchant/currency-settings">
        <DashboardLayout><CurrencySettings /></DashboardLayout>
      </Route>

      <Route path="/merchant/push-notifications">
        <DashboardLayout><PushNotificationsSettings /></DashboardLayout>
      </Route>

      <Route path="/merchant/scheduled-reports">
        <DashboardLayout><ScheduledReports /></DashboardLayout>
      </Route>

      <Route path="/merchant/whatsapp-auto-notifications">
        <DashboardLayout><WhatsAppAutoNotifications /></DashboardLayout>
      </Route>

      <Route path="/merchant/reports">
        <DashboardLayout>
          <Reports />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/subscriptions">
        <DashboardLayout>
          <Subscriptions />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/usage">
        <DashboardLayout>
          <Usage />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/usage-dashboard">
        <DashboardLayout>
          <UsageDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/subscription/plans">
        <DashboardLayout>
          <SubscriptionPlansMerchant />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/subscription/compare">
        <DashboardLayout>
          <ComparePlans />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/subscription">
        <DashboardLayout>
          <MySubscription />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/checkout">
        <DashboardLayout>
          <Checkout />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/payment/success">
        <PaymentSuccess />
      </Route>

      <Route path="/merchant/payment/cancel">
        <PaymentCancel />
      </Route>

      <Route path="/merchant/customers">
        <DashboardLayout>
          <Customers />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/website-analysis">
        <DashboardLayout>
          <WebsiteAnalysis />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/smart-analysis">
        <DashboardLayout>
          <SmartAnalysis />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/competitor-analysis">
        <DashboardLayout>
          <CompetitorAnalysis />
        </DashboardLayout>
      </Route>

      <Route path="/merchant/customers/:phone">
        <DashboardLayout>
          <CustomerDetails />
        </DashboardLayout>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin/dashboard">
        <DashboardLayout>
          <AdminDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/admin/campaigns">
        <DashboardLayout>
          <AdminCampaigns />
        </DashboardLayout>
      </Route>

      <Route path="/admin/merchants">
        <DashboardLayout>
          <MerchantsManagement />
        </DashboardLayout>
      </Route>

      <Route path="/admin/merchants/:id">
        <DashboardLayout>
          <MerchantDetails />
        </DashboardLayout>
      </Route>

      <Route path="/admin/payment-gateways">
        <DashboardLayout>
          <PaymentGateways />
        </DashboardLayout>
      </Route>

      <Route path="/admin/google-oauth">
        <DashboardLayout>
          <GoogleOAuthSettings />
        </DashboardLayout>
      </Route>

      <Route path="/admin/settings">
        <DashboardLayout>
          <AdminSettings />
        </DashboardLayout>
      </Route>

      <Route path="/admin/whatsapp-requests">
        <DashboardLayout>
          <WhatsAppRequestsPage />
        </DashboardLayout>
      </Route>

      <Route path="/admin/smtp-settings">
        <DashboardLayout>
          <SMTPSettings />
        </DashboardLayout>
      </Route>

      <Route path="/admin/email-templates">
        <DashboardLayout>
          <EmailTemplates />
        </DashboardLayout>
      </Route>

      <Route path="/admin/template-translations">
        <DashboardLayout>
          <TemplateTranslations />
        </DashboardLayout>
      </Route>

      <Route path="/admin/google-oauth">
        <DashboardLayout>
          <AdminGoogleOAuth />
        </DashboardLayout>
      </Route>

      <Route path="/admin/data-sync">
        <DashboardLayout>
          <AdminDataSync />
        </DashboardLayout>
      </Route>

      {/* SEO Route - Unified */}
      <Route path="/admin/seo">
        <DashboardLayout>
          <SeoUnified />
        </DashboardLayout>
      </Route>

      <Route path="/admin/seo/recommendations">
        <DashboardLayout>
          <AdminRecommendations />
        </DashboardLayout>
      </Route>

      <Route path="/admin/seo/recommendations/analytics">
        <DashboardLayout>
          <RecommendationsAnalytics />
        </DashboardLayout>
      </Route>

      <Route path="/admin/seo/global-settings">
        <DashboardLayout>
          <GlobalSeoSettings />
        </DashboardLayout>
      </Route>

      <Route path="/admin/ab-test-dashboard">
        <DashboardLayout>
          <AdminABTestDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/admin/subscription-plans">
        <DashboardLayout>
          <SubscriptionPlansAdmin />
        </DashboardLayout>
      </Route>

      {/* Alias routes for packages and addons */}
      <Route path="/admin/packages">
        <DashboardLayout>
          <SubscriptionPlansAdmin />
        </DashboardLayout>
      </Route>

      <Route path="/admin/subscription-addons">
        <DashboardLayout>
          <SubscriptionAddonsAdmin />
        </DashboardLayout>
      </Route>

      <Route path="/admin/addons">
        <DashboardLayout>
          <SubscriptionAddonsAdmin />
        </DashboardLayout>
      </Route>

      <Route path="/admin/tap-settings">
        <DashboardLayout>
          <TapSettings />
        </DashboardLayout>
      </Route>

      <Route path="/admin/notifications">
        <DashboardLayout>
          <NotificationDashboard />
        </DashboardLayout>
      </Route>

      <Route path="/admin/subscription-reports">
        <DashboardLayout>
          <SubscriptionReports />
        </DashboardLayout>
      </Route>

      <Route path="/admin/invoices">
        <DashboardLayout>
          <AdminInvoices />
        </DashboardLayout>
      </Route>

      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
