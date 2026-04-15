import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import StepSpend from '../components/wallet/StepSpend';
import StepCards from '../components/wallet/StepCards';
import StepPreferences from '../components/wallet/StepPreferences';
import WalletResults from '../components/wallet/WalletResults';
import PlaidLinkStep from '../components/wallet/PlaidLinkStep';

const STEPS = ['Spending', 'Cards', 'Preferences'];
const LS_KEY = 'pointsmax_wallet';

function isComplete(s) {
  return Object.values(s.spend).some(v => parseFloat(v) > 0)
    && s.ownedCards.length > 0
    && !!s.redeemStyle;
}

function loadFromStorage(fallback) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {}
  return fallback;
}

export default function WalletOptimizer() {
  const { state, dispatch } = useApp();

  const defaultLocal = {
    spend: { ...state.spend },
    ownedCards: [...state.ownedCards],
    cards24months: state.cards24months,
    amexCount: state.amexCount,
    heldCards: [...state.heldCards],
    selectedCredits: { ...state.selectedCredits },
    redeemStyle: state.redeemStyle,
    categoryEntries: { ...state.categoryEntries },
    activationStatus: { ...state.activationStatus },
  };

  const [local, setLocal] = useState(() => loadFromStorage(defaultLocal));

  // Persist to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch {}
  }, [local]);

  // Auto-show results if context already has completed data
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(() => isComplete(local));

  // Show Plaid link step when there's no existing spend data
  const hasSpend = Object.values(local.spend).some(v => parseFloat(v) > 0);
  const [showLinkStep, setShowLinkStep] = useState(!hasSpend);
  const [plaidSource, setPlaidSource] = useState(false); // true if spend came from Plaid
  const [plaidDetectedCards, setPlaidDetectedCards] = useState([]); // card IDs matched from bank accounts

  const syncToContext = (updatedLocal) => {
    dispatch({ type: 'SET_SPEND', payload: updatedLocal.spend });
    dispatch({ type: 'SET_OWNED_CARDS', payload: updatedLocal.ownedCards });
    dispatch({ type: 'SET_ELIGIBILITY', payload: { cards24months: updatedLocal.cards24months, amexCount: updatedLocal.amexCount, heldCards: updatedLocal.heldCards } });
    dispatch({ type: 'SET_CREDITS', payload: updatedLocal.selectedCredits });
    dispatch({ type: 'SET_REDEEM_STYLE', payload: updatedLocal.redeemStyle });
    dispatch({ type: 'SET_ACTIVATION', payload: updatedLocal.activationStatus });
  };

  const syncAndFinish = (updatedLocal) => {
    syncToContext(updatedLocal);
    setDone(true);
  };

  // On mount: if localStorage had a completed session, sync it to AppContext so
  // EarnAnalyzer (and any other page reading context) sees the data immediately.
  useEffect(() => {
    if (isComplete(local)) syncToContext(local);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      syncAndFinish(local);
    }
  };

  const goToStep = (n) => {
    setDone(false);
    setStep(n);
  };

  const restart = () => {
    const blank = {
      spend: { dining:'', groceries:'', travel:'', gas:'', shopping:'', subscriptions:'', entertainment:'', other:'' },
      ownedCards: [], cards24months: 0, amexCount: 0, heldCards: [],
      selectedCredits: {}, redeemStyle: 'portal', categoryEntries: {}, activationStatus: {},
    };
    setStep(0);
    setDone(false);
    setLocal(blank);
    setShowLinkStep(true);
    setPlaidSource(false);
    dispatch({ type: 'RESET' });
    try { localStorage.removeItem(LS_KEY); } catch {}
  };

  // Plaid link step handlers
  const handlePlaidLinked = useCallback((spend, detectedCards = []) => {
    setLocal(l => ({
      ...l,
      spend,
      // Pre-populate ownedCards if we detected any; keep existing selections otherwise
      ownedCards: detectedCards.length > 0 ? detectedCards : l.ownedCards,
    }));
    setPlaidDetectedCards(detectedCards);
    setPlaidSource(true);
    setShowLinkStep(false);
  }, []);

  const handlePlaidSkip = useCallback(() => {
    setShowLinkStep(false);
  }, []);

  if (showLinkStep && !done) {
    return <PlaidLinkStep onLinked={handlePlaidLinked} onSkip={handlePlaidSkip} />;
  }

  if (done) {
    return (
      <div className="page-container">
        <WalletResults local={local} onRestart={restart} onGoToStep={goToStep} plaidSource={plaidSource} />
      </div>
    );
  }

  const stepProps = { local, setLocal, onNext: next, onBack: () => setStep(s => s - 1), plaidSource, plaidDetectedCards, onConnectBank: () => setShowLinkStep(true) };

  return (
    <div className="page-container narrow">
      {/* Progress bar */}
      <div className="progress-bar">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`progress-step ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}
            onClick={() => i < step && setStep(i)}
            style={{ cursor: i < step ? 'pointer' : 'default' }}
          >
            <div className="step-circle">{i < step ? '✓' : i + 1}</div>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="step-card">
        {step === 0 && <StepSpend {...stepProps} />}
        {step === 1 && <StepCards {...stepProps} />}
        {step === 2 && <StepPreferences {...stepProps} />}
      </div>
    </div>
  );
}
