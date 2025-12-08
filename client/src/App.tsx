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
import ProductsPage from "./pages/Products";
import PricingPage from "./pages/Pricing";
import SupportPage from "./pages/Support";

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

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import MerchantsManagement from "./pages/admin/Merchants";
import MerchantDetails from "./pages/admin/MerchantDetails";
import AdminSettings from "./pages/admin/Settings";
import WhatsAppRequests from "./pages/admin/WhatsAppRequests";
import WhatsAppRequestsPage from "./pages/admin/WhatsAppRequestsPage";
import PaymentGateways from "./pages/admin/PaymentGateways";
import AdminCampaigns from "./pages/admin/Campaigns";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={SignUp} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/support" component={SupportPage} />
      
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
