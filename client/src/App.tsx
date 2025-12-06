import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";

// Merchant pages
import MerchantDashboard from "./pages/merchant/Dashboard";
import Campaigns from "./pages/merchant/Campaigns";
import NewCampaign from "./pages/merchant/NewCampaign";
import Products from "./pages/merchant/Products";
import UploadProducts from "./pages/merchant/UploadProducts";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import MerchantsManagement from "./pages/admin/Merchants";
import MerchantDetails from "./pages/admin/MerchantDetails";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      
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
      
      {/* Admin Routes */}
      <Route path="/admin/dashboard">
        <DashboardLayout>
          <AdminDashboard />
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
