import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
// import { ProtectedRoute } from "./ProtectedRoute";
import HomePage from "../pages/customer/HomePage";
import AuthPage from "../pages/customer/AuthPage";
import DashboardPage from "../pages/admin/DashboardPage";

const AppRouter = () => {
  return (
    <Routes>
      {/* Public Guest Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage />} />

      {/* Bypassed Protected Customer Routes */}
      <Route>{/* Add customer routes here if needed */}</Route>

      {/* Bypassed Protected Admin Routes */}
      <Route>
        <Route path="/admin/dashboard" element={<DashboardPage />} />
      </Route>

      {/* Wildcard Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRouter;
