import { Navigate, Route, Routes } from "react-router";

import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Login } from "./pages/Login";
import { Vendors } from "./pages/Vendors";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/vendors"
        element={
          <ProtectedRoute>
            <Vendors />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/vendors" replace />} />
    </Routes>
  );
}
