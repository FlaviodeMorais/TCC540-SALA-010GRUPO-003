import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import DataSource from "@/pages/DataSource";
import { Layout } from "@/components/layout/Layout";
import { DeviceModeProvider } from "./contexts/DeviceModeContext";
import { SystemProvider } from "./contexts/SystemContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route path="/data-source" component={DataSource} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DeviceModeProvider>
        <SystemProvider>
          <Layout>
            <Router />
          </Layout>
          <Toaster />
        </SystemProvider>
      </DeviceModeProvider>
    </QueryClientProvider>
  );
}

export default App;
