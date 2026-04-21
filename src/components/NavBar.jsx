import { NavLink, Link } from 'react-router-dom';

export default function NavBar() {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">PM</span>
          <span className="logo-text">
            Points<span className="max">Max</span>
          </span>
        </Link>

        <ul className="nav-links">
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Earn Analyzer
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/wallet"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Wallet Optimizer
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/transactions"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Transactions
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/redeem"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Redeem Scanner
            </NavLink>
          </li>
        </ul>
      </div>
    </header>
  );
}
