import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { initials } from "../lib/format";
import { Icon } from "./Icon";

export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <span
      className={`flex items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-900/30 ring-1 ring-white/10 ring-inset ${className}`}
    >
      <Icon name="building" className="size-[55%]" />
    </span>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      // Session is cleared locally regardless; nothing else to do.
    }
  };

  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 text-sm transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {initials(user.username)}
        </span>
        <span className="hidden font-medium text-slate-700 sm:block">{user.username}</span>
        <Icon name="chevronDown" className="size-4 text-slate-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 origin-top-right animate-pop-in rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-slate-900/5"
        >
          <div className="px-3 py-2.5">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="mt-0.5 flex items-center gap-2 truncate text-sm font-medium text-slate-900">
              {user.username}
              {user.is_admin && (
                <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase ring-1 ring-brand-600/15 ring-inset">
                  Admin
                </span>
              )}
            </p>
          </div>
          <div className="my-1 h-px bg-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            <Icon name="logOut" className="size-4 text-slate-400" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link to="/vendors" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">
              Vendor Management
            </span>
          </Link>
          <nav className="hidden h-16 items-stretch md:flex" aria-label="Main">
            <span
              aria-current="page"
              className="flex items-center border-b-2 border-brand-600 px-1 text-sm font-medium text-slate-900"
            >
              Vendors
            </span>
          </nav>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
