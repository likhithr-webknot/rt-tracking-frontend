import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./components/shared/AppErrorBoundary";
import GoogleCallbackPage from "./components/auth/GoogleCallbackPage";
import ForgotPasswordPage from "./components/auth/ForgotPasswordPage";
import ResetPasswordPage from "./components/auth/ResetPasswordPage";

export default function RootRouter() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<GoogleCallbackPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          
          {/* Single App mount — avoids remounting auth/portals when switching workspaces */}
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
