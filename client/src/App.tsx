import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ProductsPage from "./pages/Products";
import PricingPage from "./pages/Pricing";
import SupportPage from "./pages/Support";
import SolutionsSales from "./pages/SolutionsSales";
import SolutionsMarketing from "./pages/SolutionsMarketing";
import SolutionsSupport from "./pages/SolutionsSupport";
import ProductAI from "./pages/ProductAI";
import CompanyAbout from "./pages/CompanyAbout";
import Blog from "./pages/resources/Blog";
import HelpCenter from "./pages/resources/HelpCenter";
import SuccessStories from "./pages/resources/SuccessStories";
import Contact from "./pages/company/Contact";
import Terms from "./pages/company/Terms";
import Privacy from "./pages/company/Privacy";
import TrySari from "./pages/TrySari";

// Merchant pages
import MerchantDashboard from "./pages/merchant/Dashboard";
import Campaigns from "./pages/merchant/Campaigns";
import NewCampaign from "./pages/merchant/NewCampaign";
import CampaignDetails from "./pages/merchant/CampaignDetails";
import CampaignReport from "./pages/merchant/CampaignReport";
import Products from "./pages/merchant/Products";
import UploadProducts from "./pages/merchant/UploadProducts";
import Conversations from "./pages/merchant/Conversations";
import WhatsApp from "./pages/merchant/WhatsApp";
import SallaIntegration from "./pages/SallaIntegration";
import ChatOrders from "./pages/ChatOrders";
import DiscountCodes from "./pages/DiscountCodes";
import Referrals from "./pages/merchant/Referrals";
import MerchantSettings from "./pages/merchant/Settings";
import Reports from "./pages/merchant/Reports";
import Subscriptions from "./pages/merchant/Subscriptions";
import Usage from "./pages/merchant/Usage";
import Checkout from "./pages/merchant/Checkout";
import PaymentSuccess from "./pages/merchant/PaymentSuccess";
import PaymentCancel from "./pages/merchant/PaymentCancel";
import AbandonedCartsPage from "./pages/merchant/AbandonedCartsPage";
import OccasionCampaignsPage from "./pages/merchant/OccasionCampaignsPage";
import AnalyticsDashboard from "./pages/merchant/AnalyticsDashboard";
import Analytics from "./pages/merchant/Analytics";
import OverviewAnalytics from "./pages/merchant/OverviewAnalytics";
import Orders from "./pages/merchant/Orders";
import WhatsAppInstancesPage from "./pages/merchant/WhatsAppInstancesPage";
import WhatsAppSetupWizard from "./pages/merchant/WhatsAppSetupWizard";
import OrderNotificationsSettings from "./pages/merchant/OrderNotificationsSettings";
import WhatsAppTest from "./pages/merchant/WhatsAppTest";
import GreenAPISetupGuide from "./pages/merchant/GreenAPISetupGuide";
import Reviews from "./pages/merchant/Reviews";
import TestSari from "./pages/merchant/TestSari";
import MetricsDashboard from "./pages/merchant/MetricsDashboard";
import SariPlayground from "./pages/SariPlayground";
import SariAnalytics from "./pages/SariAnalytics";
import WhatsAppWebhookSetup from "./pages/merchant/WhatsAppWebhookSetup";
import BotSettings from "./pages/merchant/BotSettings";
import ScheduledMessages from "./pages/merchant/ScheduledMessages";
import SariPersonality from "./pages/merchant/SariPersonality";
import QuickResponses from "./pages/merchant/QuickResponses";
import InsightsDashboard from "./pages/merchant/InsightsDashboard";
import AdvancedAnalytics from "./pages/merchant/AdvancedAnalytics";
import DataSync from "./pages/merchant/DataSync";
import PerformanceMetrics from "./pages/merchant/PerformanceMetrics";
import SetupWizard from "./pages/SetupWizard";
import CalendarSettings from "./pages/CalendarSettings";
import CalendarPage from "./pages/CalendarPage";
import StaffManagement from "./pages/StaffManagement";
import ServicesManagement from "./pages/merchant/ServicesManagement";
import ServiceForm from "./pages/merchant/ServiceForm";
import ServiceCategories from "./pages/merchant/ServiceCategories";
import ServicePackages from "./pages/merchant/ServicePackages";
import ServiceDetails from "./pages/ServiceDetails";
import BookingsManagement from "./pages/BookingsManagement";
import SheetsSettings from "./pages/SheetsSettings";
import SheetsExport from "./pages/SheetsExport";
import SheetsReports from "./pages/SheetsReports";
import SheetsInventory from "./pages/SheetsInventory";
import Payments from "./pages/merchant/Payments";
import PaymentLinks from "./pages/merchant/PaymentLinks";
import PaymentDetails from "./pages/PaymentDetails";
import LoyaltySettings from "./pages/LoyaltySettings";
import LoyaltyTiers from "./pages/LoyaltyTiers";
import LoyaltyRewards from "./pages/LoyaltyRewards";
import LoyaltyCustomers from "./pages/LoyaltyCustomers";
import CustomerLoyalty from "./pages/CustomerLoyalty";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import MerchantsManagement from "./pages/admin/Merchants";
import MerchantDetails from "./pages/admin/MerchantDetails";
import AdminSettings from "./pages/admin/Settings";
import WhatsAppRequests from "./pages/admin/WhatsAppRequests";
import WhatsAppRequestsPage from "./pages/admin/WhatsAppRequestsPage";
import PaymentGateways from "./pages/admin/PaymentGateways";
import AdminCampaigns from "./pages/admin/Campaigns";
import SMTPSettings from "./pages/admin/SMTPSettings";
import SeoDashboard from "./pages/admin/SeoDashboard";
import SeoPages from "./pages/admin/SeoPages";
import SeoMetaTags from "./pages/admin/SeoMetaTags";
import SeoOpenGraph from "./pages/admin/SeoOpenGraph";
import SeoTracking from "./pages/admin/SeoTracking";
import SeoAnalytics from "./pages/admin/SeoAnalytics";
import SeoKeywords from "./pages/admin/SeoKeywords";
import SeoBacklinks from "./pages/admin/SeoBacklinks";
import AdminRecommendations from "./pages/admin/AdminRecommendations";
import RecommendationsAnalytics from "./pages/admin/RecommendationsAnalytics";
import AdminGoogleOAuth from "./pages/AdminGoogleOAuth";
import AdminDataSync from "./pages/AdminDataSync";
import GlobalSeoSettings from "./pages/admin/GlobalSeoSettings";
import GoogleOAuthSettings from "./pages/admin/GoogleOAuthSettings";

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
      
      {/* SEO Routes */}
      <Route path="/admin/seo/dashboard">
        <DashboardLayout>
          <SeoDashboard />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/pages">
        <DashboardLayout>
          <SeoPages />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/meta-tags">
        <DashboardLayout>
          <SeoMetaTags />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/open-graph">
        <DashboardLayout>
          <SeoOpenGraph />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/tracking">
        <DashboardLayout>
          <SeoTracking />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/analytics">
        <DashboardLayout>
          <SeoAnalytics />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/keywords">
        <DashboardLayout>
          <SeoKeywords />
        </DashboardLayout>
      </Route>
      
      <Route path="/admin/seo/backlinks">
        <DashboardLayout>
          <SeoBacklinks />
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
      
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
