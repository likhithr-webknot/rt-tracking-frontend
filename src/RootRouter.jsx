import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import AppErrorBoundary from "./components/shared/AppErrorBoundary.jsx";
import GoogleCallbackPage from "./components/auth/GoogleCallbackPage.jsx";

export default function RootRouter() {
  return (
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/auth/callback" element={<GoogleCallbackPage />} />
            <Route path="/*" element={<App />} />
          </Routes>
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
