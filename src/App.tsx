import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CompanyProvider } from './context/CompanyContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import EmployeeDashboard from './pages/EmployeeDashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import SupervisorDashboard from './pages/SupervisorDashboard';
import SupervisorDelegationDashboard from './pages/SupervisorDelegationDashboard';
import InspectorDashboard from './pages/InspectorDashboard';

function App() {
  return (
    <CompanyProvider>
      <Router>
        <Routes>
          {/* Ruta principal */}
          <Route path="/" element={<Home />} />

          {/* Rutas de login */}
          <Route path="/login/:portal" element={<Login />} />
          <Route path="/login/supervisor/delegacion" element={<Login />} />
          <Route path="/login/supervisor/centro" element={<Login />} />

          {/* Rutas de registro */}
          <Route path="/register/:portal" element={<Register />} />

          {/* Rutas de dashboards */}
          <Route path="/empleado/*" element={<EmployeeDashboard />} />
          <Route path="/empresa/*" element={<CompanyDashboard />} />
          <Route path="/supervisor/centro/*" element={<SupervisorDashboard />} />
          <Route path="/supervisor/delegacion/*" element={<SupervisorDelegationDashboard />} />

          {/* Nueva ruta para el inspector */}
          <Route path="/inspector/*" element={<InspectorDashboard />} />

          {/* Rutas alternativas para compatibilidad */}
          <Route path="/empleados/*" element={<Navigate to="/empresa/empleados" replace />} />
          <Route path="/solicitudes/*" element={<Navigate to="/empresa/solicitudes" replace />} />
          <Route path="/calendario/*" element={<Navigate to="/empresa/calendario" replace />} />
          <Route path="/informes/*" element={<Navigate to="/empresa/informes" replace />} />
          <Route path="/inspector-credenciales/*" element={<Navigate to="/empresa/inspector" replace />} />
          <Route path="/ajustes/*" element={<Navigate to="/empresa/ajustes" replace />} />
          
          {/* Ruta de fallback para cualquier otra ruta */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </CompanyProvider>
  );
}

export default App;