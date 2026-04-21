import { createContext, useContext, useReducer } from 'react';

const defaultState = {
  spend: {
    dining: '', groceries: '', flights: '', travel: '', gas: '',
    shopping: '', subscriptions: '', entertainment: '', other: '',
  },
  ownedCards: [],
  cards24months: 0,
  amexCount: 0,
  heldCards: [],
  selectedCredits: {},    // { cardId: [creditId, ...] }
  redeemStyle: 'portal',
  categoryEntries: {},    // { category: [{ cardId, amount }, ...] }
  activationStatus: {},   // { cardId: boolean }
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SPEND':
      return { ...state, spend: action.payload };
    case 'SET_OWNED_CARDS':
      return { ...state, ownedCards: action.payload };
    case 'SET_ELIGIBILITY':
      return { ...state, ...action.payload };
    case 'SET_CREDITS':
      return { ...state, selectedCredits: action.payload };
    case 'SET_REDEEM_STYLE':
      return { ...state, redeemStyle: action.payload };
    case 'SET_CATEGORY_ENTRIES':
      return { ...state, categoryEntries: action.payload };
    case 'TOGGLE_ACTIVATION': {
      const { cardId } = action.payload;
      return {
        ...state,
        activationStatus: {
          ...state.activationStatus,
          [cardId]: !state.activationStatus[cardId],
        },
      };
    }
    case 'SET_ACTIVATION':
      return { ...state, activationStatus: action.payload };
    case 'RESET':
      return defaultState;
    default:
      return state;
  }
}

export const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
