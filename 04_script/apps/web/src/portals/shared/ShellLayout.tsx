import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Shared portal chrome: top header (brand + stats) + sidebar nav + main. */
export function ShellLayout({
  brand,
  nav,
  footer,
  topbar,
  children,
}: {
  brand: ReactNode;
  nav: ReactNode;
  footer: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <header className="shell-header">
        <div className="brand shell-header-brand">{brand}</div>
        {topbar ? <div className="shell-header-topbar">{topbar}</div> : null}
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mobile-nav-toggle-icon" aria-hidden>
            {open ? '✕' : '☰'}
          </span>
        </button>
      </header>
      {open && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="shell-body">
        <aside className="side" id="portal-side-nav">
          <div className="brand side-brand mobile-only-brand">{brand}</div>
          <nav className="nav">{nav}</nav>
          <div className="side-footer">{footer}</div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
