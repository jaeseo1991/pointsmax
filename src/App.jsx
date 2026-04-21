import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import NavBar from './components/NavBar';
import EarnAnalyzer from './pages/EarnAnalyzer';
import WalletOptimizer from './pages/WalletOptimizer';
import RedeemScanner from './pages/RedeemScanner';
import Transactions from './pages/Transactions';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<EarnAnalyzer />} />
          <Route path="/earn" element={<Navigate to="/" replace />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/wallet" element={<WalletOptimizer />} />
          <Route path="/redeem" element={<RedeemScanner />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
