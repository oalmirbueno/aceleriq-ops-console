import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/layouts/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ClientsPage from "@/pages/ClientsPage";
import WorkspacesPage from "@/pages/WorkspacesPage";
import WorkspaceDetailPage from "@/pages/WorkspaceDetailPage";
import SettingsPage from "@/pages/SettingsPage";
import AiManagementPage from "@/pages/AiManagementPage";
import AdminRoute from "@/components/AdminRoute";
import NotFound from "@/pages/NotFound";
import ClientBriefingPage from "@/pages/ClientBriefingPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/briefing/:token" element={<ClientBriefingPage />} />
            <Route path="/" element={<Navigate to="/ops" replace />} />
            <Route
              path="/ops"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="workspaces" element={<WorkspacesPage />} />
              <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="ai" element={<AdminRoute><AiManagementPage /></AdminRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
