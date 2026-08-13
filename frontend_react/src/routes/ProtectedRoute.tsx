import React from "react";
import { Navigate, Outlet } from "react-router-dom";

const ProtectedRoute: React.FC = () => {
  // do auth checks here (inside the component), e.g. from context or a custom hook
  // const { user } = useAuth();  <-- ok to call inside component
  const isAuthenticated = false; // <-- replace with real check

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
};

export default ProtectedRoute;
