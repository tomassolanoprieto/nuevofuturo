import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CompanyProvider } from './context/CompanyContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import EmployeeDashboard from './pages/EmployeeDashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import SupervisorDashboard from './pages/SupervisorDashboard';
import SupervisorDelegationDashboard from './pages/SupervisorDelegationDashboard';

function App() {
  return (
    <CompanyProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login/:portal" element={<Login />} />
          <Route path="/login/supervisor/delegacion" element={<Login />} />
          <Route path="/login/supervisor/centro" element={<Login />} />
          <Route path="/register/:portal" element={<Register />} />
          <Route path="/empleado/*" element={<EmployeeDashboard />} />
          <Route path="/empresa/*" element={<CompanyDashboard />} />
          <Route path="/supervisor/centro/*" element={<SupervisorDashboard />} />
          <Route path="/supervisor/delegacion/*" element={<SupervisorDelegationDashboard />} />
        </Routes>
      </Router>
    </CompanyProvider>
  );
}

export default App;