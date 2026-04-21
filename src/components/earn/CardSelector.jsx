import { CARDS } from '../../data/cards';

const ISSUER_DISPLAY = {
  Chase:      'Chase',
  Amex:       'American Express',
  Citi:       'Citi',
  CapitalOne: 'Capital One',
  WellsFargo: 'Wells Fargo',
  USBank:     'U.S. Bank',
  Discover:   'Discover',
  Robinhood:  'Robinhood',
  Bilt:       'Bilt',
  Apple:      'Apple',
};

const ISSUER_ORDER = ['Chase', 'Amex', 'Citi', 'CapitalOne', 'WellsFargo', 'USBank', 'Discover', 'Robinhood', 'Bilt', 'Apple'];

function shortName(name) {
  return name
    .replace('Chase ', '')
    .replace('American Express ', 'Amex ')
    .replace('Capital One ', '');
}

// Group cards by issuer
const grouped = CARDS.reduce((acc, card) => {
  if (!acc[card.issuer]) acc[card.issuer] = [];
  acc[card.issuer].push(card);
  return acc;
}, {});

export default function CardSelector({ selected, onChange }) {
  const toggle = (id) => {
    onChange(selected.includes(id)
      ? selected.filter(c => c !== id)
      : [...selected, id]
    );
  };

  return (
    <div className="card-selector">
      {ISSUER_ORDER.filter(issuer => grouped[issuer]).map(issuer => (
        <div key={issuer} className="card-selector-group">
          <div className="card-selector-issuer">{ISSUER_DISPLAY[issuer] || issuer}</div>
          <div className="card-selector-chips">
            {grouped[issuer].map(card => {
              const isSelected = selected.includes(card.id);
              return (
                <button
                  key={card.id}
                  className={`card-selector-chip${isSelected ? ' selected' : ''}`}
                  style={isSelected ? { borderColor: card.color, background: `${card.color}18` } : {}}
                  onClick={() => toggle(card.id)}
                >
                  <span className="card-chip-dot" style={{ background: card.color }} />
                  <span className="card-chip-name">{shortName(card.name)}</span>
                  {isSelected && <span className="card-chip-check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
