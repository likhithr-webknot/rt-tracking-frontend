import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import AppErrorBoundary from "./components/shared/AppErrorBoundary.jsx";
import GoogleCallbackPage from "./components/auth/GoogleCallbackPage.jsx";

export default function RootRouter() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<GoogleCallbackPage />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
