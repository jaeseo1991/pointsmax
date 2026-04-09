import { Link } from 'react-router-dom';

const FEATURES = [
  {
    key: 'gap0',
    icon: '🔴',
    label: 'Gap 0 — Unactivated',
    title: 'Free money you\'re leaving behind',
    desc: 'Rotating bonus categories and statement credits you own but aren\'t using. Zero effort, immediate upside.',
  },
  {
    key: 'gap1',
    icon: '🟣',
    label: 'Gap 1 — Wrong Routing',
    title: 'Wrong card, right purchase',
    desc: 'Using a 1.5x card for groceries when you own a 4x card. We show you exactly what each mis-swipe costs monthly.',
  },
  {
    key: 'gap2',
    icon: '🟠',
    label: 'Gap 2 — Better Cards',
    title: 'What the market can do for you',
    desc: 'Based on your spend profile, we model which cards would unlock the most additional value — including year 1 bonuses.',
  },
];

export default function Landing() {
  return (
    <div>
      <div className="landing-hero">
        <h1>
          Find out how much you're<br />
          <em>leaving on the table.</em>
        </h1>
        <p>
          Enter your spend once. See your missed points, best card combo,
          and top redemption opportunities — personalized to your wallet.
        </p>
        <div className="landing-ctas">
          <Link to="/wallet" className="btn btn-primary">
            Optimize my wallet →
          </Link>
          <Link to="/earn" className="btn btn-outline">
            Analyze my earning →
          </Link>
        </div>
      </div>

      <div className="feature-cards">
        {FEATURES.map(f => (
          <div key={f.key} className={`feature-card ${f.key}`}>
            <div className="feature-card-icon">{f.icon}</div>
            <div className="feature-card-label">{f.label}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
