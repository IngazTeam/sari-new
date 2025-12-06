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
