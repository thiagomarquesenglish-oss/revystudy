import LibraryManagePage from './pages/LibraryManagePage';
import NavigationPosition from './components/NavigationPosition';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import OfflineBanner from "@/components/OfflineBanner";
import TabLayout from "./components/TabLayout";
import DeckAudiosPage from "./pages/DeckAudiosPage";
import DeckPage from "./pages/DeckPage";
import StudyPage from "./pages/StudyPage";
import CustomStudyPage from "./pages/CustomStudyPage";
import DictationPage from "./pages/DictationPage";
import AddCardPage from "./pages/AddCardPage";
import EditCardPage from "./pages/EditCardPage";
import LineByLinePage from "./pages/LineByLinePage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <NavigationPosition />
          <OfflineBanner />
          <TabLayout />
          <Routes>
            <Route path="/curriculum/study" element={<ProtectedRoute><StudyPage /></ProtectedRoute>} />
            <Route path="/library/manage" element={<ProtectedRoute><LibraryManagePage /></ProtectedRoute>} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/" element={null} />
            <Route path="/decks" element={null} />
            <Route path="/stats" element={null} />
            <Route path="/settings" element={null} />
            <Route path="/profile" element={null} />
            <Route path="/deck/:deckId" element={<ProtectedRoute><DeckPage /></ProtectedRoute>} />
            <Route path="/deck/:deckId/audios" element={<ProtectedRoute><DeckAudiosPage /></ProtectedRoute>} />
            <Route path="/study/:deckId" element={<ProtectedRoute><StudyPage /></ProtectedRoute>} />
            <Route path="/custom-study/:deckId" element={<ProtectedRoute><CustomStudyPage /></ProtectedRoute>} />
            <Route path="/dictation/:deckId" element={<ProtectedRoute><DictationPage /></ProtectedRoute>} />
            <Route path="/deck/:deckId/add" element={<ProtectedRoute><AddCardPage /></ProtectedRoute>} />
            <Route path="/card/:cardId/edit" element={<ProtectedRoute><EditCardPage /></ProtectedRoute>} />
            <Route path="/audio/:audioId/lines" element={<ProtectedRoute><LineByLinePage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
