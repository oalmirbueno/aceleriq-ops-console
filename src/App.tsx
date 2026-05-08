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
import ClientVaultPage from "@/pages/ClientVaultPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import WorkspacesPage from "@/pages/WorkspacesPage";
import WorkspaceDetailPage from "@/pages/WorkspaceDetailPage";
import CanvasPage from "@/pages/CanvasPage";
import CanvasFullscreenPage from "@/pages/CanvasFullscreenPage";
import ProjectCanvasPage from "@/pages/ProjectCanvasPage";
import SettingsPage from "@/pages/SettingsPage";
import AiManagementPage from "@/pages/AiManagementPage";
import SyncLogsPage from "@/pages/SyncLogsPage";
import AdminRoute from "@/components/AdminRoute";
import NotFound from "@/pages/NotFound";
import ClientBriefingPage from "@/pages/ClientBriefingPage";
// OPS V2 (skeleton — Fase V2.0)
import AppLayoutV2 from "@/v2/layouts/AppLayoutV2";
import DashboardV2 from "@/v2/pages/DashboardV2";
import ClientsV2 from "@/v2/pages/ClientsV2";
import ProjectsV2 from "@/v2/pages/ProjectsV2";
import ProjectDetailV2 from "@/v2/pages/ProjectDetailV2";
import CanvasV2 from "@/v2/pages/CanvasV2";
import SettingsV2 from "@/v2/pages/SettingsV2";
import OverviewTabV2 from "@/v2/pages/tabs/OverviewTabV2";
import MilestonesTabV2 from "@/v2/pages/tabs/MilestonesTabV2";
import TasksTabV2 from "@/v2/pages/tabs/TasksTabV2";
import ContextTabV2 from "@/v2/pages/tabs/ContextTabV2";
import FilesTabV2 from "@/v2/pages/tabs/FilesTabV2";
import HistoryTabV2 from "@/v2/pages/tabs/HistoryTabV2";

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
            <Route path="/ops/canvas/open" element={<ProtectedRoute><CanvasFullscreenPage /></ProtectedRoute>} />
            <Route path="/ops/projects/:portalProjectId" element={<ProtectedRoute><ProjectCanvasPage /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/ops" replace />} />
            <Route path="/ops" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="clients/:id/vault" element={<ClientVaultPage />} />
              <Route path="workspaces" element={<WorkspacesPage />} />
              <Route path="workspaces/:workspaceId/execution" element={<WorkspaceDetailPage />} />
              <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
              <Route path="canvas" element={<CanvasPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="ai" element={<AdminRoute><AiManagementPage /></AdminRoute>} />
              <Route path="sync-logs" element={<AdminRoute><SyncLogsPage /></AdminRoute>} />
            </Route>
            <Route path="/ops-v2" element={<ProtectedRoute><AppLayoutV2 /></ProtectedRoute>}>
              <Route index element={<DashboardV2 />} />
              <Route path="clientes" element={<ClientsV2 />} />
              <Route path="projetos" element={<ProjectsV2 />} />
              <Route path="projetos/:projectId" element={<ProjectDetailV2 />}>
                <Route index element={<OverviewTabV2 />} />
                <Route path="milestones" element={<MilestonesTabV2 />} />
                <Route path="tarefas" element={<TasksTabV2 />} />
                <Route path="contexto" element={<ContextTabV2 />} />
                <Route path="arquivos" element={<FilesTabV2 />} />
                <Route path="historico" element={<HistoryTabV2 />} />
              </Route>
              <Route path="projetos/:projectId/canvas" element={<CanvasV2 />} />
              <Route path="configuracoes" element={<SettingsV2 />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
