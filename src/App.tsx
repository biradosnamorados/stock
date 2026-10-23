import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import PinLogin from './pages/PinLogin';
import PasswordReset from './pages/PasswordReset';
import Dashboard from './pages/Dashboard';
import Production from './pages/Production';
import Packaging from './pages/Packaging';
import Stock from './pages/Stock';
import InternalOrders from './pages/InternalOrders';
import Scanner from './pages/Scanner';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import SMTPSettings from './pages/SMTPSettings';
import PriceAnalysis from './pages/PriceAnalysis';
import Import from './pages/Import';
import Recipes from './pages/Recipes';
import StockCounts from './pages/StockCounts';
import Haccp from './pages/Haccp';
import MandatoryTasks from './pages/mandatory-tasks/MandatoryTasks';
import AccessProfiles from './pages/access-profiles/AccessProfiles';
import Register from './pages/Register';
import UpdatePassword from './pages/UpdatePassword';
import PendingRegistrations from './pages/PendingRegistrations';
import CashClosing from './pages/CashClosing';
import CashmaticSettings from './pages/CashmaticSettings';
import CashClosingReport from './pages/CashClosingReport';
import UberReports from './pages/UberReports';
import Purchases from './pages/Purchases';
import MobileLayout from './mobile/MobileLayout';
import MobileHome from './mobile/MobileHome';
import MobileMore from './mobile/MobileMore';
import NoticeCompose from './mobile/NoticeCompose';
import { isApp } from './lib/native';

const APP = isApp();

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pin-login" element={<PinLogin />} />
          <Route path="/register" element={<Register />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route
            path="/password-reset"
            element={
              <ProtectedRoute>
                <PasswordReset />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                {APP ? <MobileLayout /> : <Layout />}
              </ProtectedRoute>
            }
          >
            <Route index element={APP ? <MobileHome /> : <Dashboard />} />
            <Route path="mais" element={<MobileMore />} />
            <Route path="avisos/novo" element={<NoticeCompose />} />
            <Route path="production" element={<Production />} />
            <Route path="packaging" element={<Packaging />} />
            <Route path="stock" element={<Stock />} />
            <Route path="internal-orders" element={<InternalOrders />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="purchase-orders" element={<Navigate to="/purchases" replace />} />
            <Route path="goods-receipts" element={<Navigate to="/purchases?tab=rececoes" replace />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="qr-scanner" element={<Navigate to="/scanner" replace />} />
            <Route path="price-analysis" element={<PriceAnalysis />} />
            <Route path="products" element={<Products />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="import" element={<Import />} />
            <Route path="users" element={<Users />} />
            <Route path="access-profiles" element={<AccessProfiles />} />
            <Route path="smtp-settings" element={<SMTPSettings />} />
            <Route path="recipes" element={<Recipes />} />
            <Route path="stock-counts" element={<StockCounts />} />
            <Route path="haccp" element={<Haccp />} />
            <Route path="mandatory-tasks" element={<MandatoryTasks />} />
            <Route path="pending-registrations" element={<PendingRegistrations />} />
            <Route path="cash-closing" element={<CashClosing />} />
            <Route path="cashmatic-settings" element={<CashmaticSettings />} />
            <Route path="cash-closing-report" element={<CashClosingReport />} />
            <Route path="uber" element={<UberReports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
