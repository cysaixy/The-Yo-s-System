import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "../pages/customer/HomePage";
import AuthPage from "../pages/customer/AuthPage";
import DashboardPage from "../pages/admin/DashboardPage";

const AppRouter = () => {
  return (
    <Routes>
      {/* Public Guest Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage />} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" element={<DashboardPage />} />

      {/* Wildcard Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRouter;
