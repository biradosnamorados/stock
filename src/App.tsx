import { useState } from 'react';
import { useAuth, AuthProvider } from './lib/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import Stock from './pages/Stock';
import TechnicalSheets from './pages/TechnicalSheets';
import Orders from './pages/Orders';
import Receptions from './pages/Receptions';
import SalesImport from './pages/SalesImport';
import Alerts from './pages/Alerts';
import ProductHistory from './pages/ProductHistory';
import Users from './pages/Users';
import Layout from './components/Layout';

function AppContent() {
  const { user, loading, profile } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-[#F20519] to-[#048ABF] rounded-xl animate-pulse mx-auto mb-4" />
          <p className="text-slate-600">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return profile?.role === 'admin' ? <Products /> : <Dashboard />;
      case 'categories':
        return profile?.role === 'admin' ? <Categories /> : <Dashboard />;
      case 'suppliers':
        return <Suppliers />;
      case 'stock':
        return <Stock />;
      case 'technical-sheets':
        return <TechnicalSheets />;
      case 'orders':
        return <Orders />;
      case 'receptions':
        return <Receptions />;
      case 'sales-import':
        return <SalesImport />;
      case 'alerts':
        return <Alerts />;
      case 'product-history':
        return profile?.role === 'admin' ? <ProductHistory /> : <Dashboard />;
      case 'users':
        return profile?.role === 'admin' ? <Users /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
