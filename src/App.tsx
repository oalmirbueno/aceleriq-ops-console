import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";
import ClientBriefingPage from "@/pages/ClientBriefingPage";
import BriefingsLayout from "@/briefings/layout/BriefingsLayout";
import BriefingsCentralPage from "@/briefings/pages/BriefingsCentralPage";
import BriefingsClientPage from "@/briefings/pages/BriefingsClientPage";
import BriefingsAnswerPage from "@/briefings/pages/BriefingsAnswerPage";

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
            <Route path="/" element={<Navigate to="/briefings" replace />} />
            <Route path="/briefings" element={<ProtectedRoute><BriefingsLayout /></ProtectedRoute>}>
              <Route index element={<BriefingsCentralPage />} />
              <Route path=":clientId" element={<BriefingsClientPage />} />
              <Route path=":clientId/:entryId" element={<BriefingsAnswerPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
