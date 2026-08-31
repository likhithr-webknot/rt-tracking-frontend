import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./components/shared/AppErrorBoundary";
import GoogleCallbackPage from "./components/auth/GoogleCallbackPage";
import SpaPathBootstrap from "./components/shared/SpaPathBootstrap";

export default function RootRouter() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <SpaPathBootstrap />
        <Routes>
          <Route path="/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/auth/callback" element={<GoogleCallbackPage />} />
          <Route path="/auth/forgot-password" element={<Navigate to="/" replace />} />
          <Route path="/auth/reset-password" element={<Navigate to="/" replace />} />
          
          {/* Single App mount — avoids remounting auth/portals when switching workspaces */}
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
