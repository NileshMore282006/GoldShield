import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useApp } from './state.jsx';
import Navbar from './components/Navbar.jsx';
import Spinner from './components/Spinner.jsx';
import ToastContainer from './components/Toast.jsx';
import Footer from './components/Footer.jsx';
import Dashboard from './pages/Dashboard.jsx';
import HedgeAdvisor from './pages/HedgeAdvisor.jsx';
import Orders from './pages/Orders.jsx';
import Markets from './pages/Markets.jsx';

function OfflineBanner() {
  const { isOffline } = useApp();
  if (!isOffline) return null;
  return (
    <div className="offline-banner">
      API server offline — showing cached / fallback data. Start it with: <code>python api.py</code>
    </div>
  );
}

function AppInner() {
  return (
    <BrowserRouter>
      <Navbar />
      <OfflineBanner />
      <Spinner />
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/hedge" element={<HedgeAdvisor />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/markets" element={<Markets />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
