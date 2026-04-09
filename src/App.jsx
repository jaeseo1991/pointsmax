import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import NavBar from './components/NavBar';
import Landing from './pages/Landing';
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
          <Route path="/" element={<Landing />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/earn" element={<EarnAnalyzer />} />
          <Route path="/wallet" element={<WalletOptimizer />} />
          <Route path="/redeem" element={<RedeemScanner />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
