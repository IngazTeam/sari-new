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
import Products from "./pages/merchant/Products";
import UploadProducts from "./pages/merchant/UploadProducts";
import Conversations from "./pages/merchant/Conversations";
import WhatsApp from "./pages/merchant/WhatsApp";
import SallaIntegration from "./pages/SallaIntegration";
import MerchantSettings from "./pages/merchant/Settings";
import Reports from "./pages/merchant/Reports";
import Subscriptions from "./pages/merchant/Subscriptions";
import Checkout from "./pages/merchant/Checkout";
import PaymentSuccess from "./pages/merchant/PaymentSuccess";
import PaymentCancel from "./pages/merchant/PaymentCancel";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import MerchantsManagement from "./pages/admin/Merchants";
import MerchantDetails from "./pages/admin/MerchantDetails";
import AdminSettings from "./pages/admin/Settings";
import WhatsAppRequests from "./pages/admin/WhatsAppRequests";
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
          <WhatsAppRequests />
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
