import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { BrandMark } from "../components/AppHeader";
import { Icon, type IconName } from "../components/Icon";
import { Spinner } from "../components/Spinner";

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "calendarClock",
    title: "Never miss a renewal",
    text: "Upcoming and overdue renewals are flagged automatically.",
  },
  {
    icon: "file",
    title: "Agreements in one place",
    text: "Keep signed contracts attached to every vendor record.",
  },
  {
    icon: "shield",
    title: "Restricted access",
    text: "Only signed-in team members can view or change vendor data.",
  },
];

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/vendors";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_0%_0%,var(--color-brand-700),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,var(--color-brand-800),transparent_60%)] opacity-70"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />

        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-lg font-semibold tracking-tight text-white">Vendor Management</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            Every vendor contract, cost and renewal — in one place.
          </h2>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-white/15 ring-inset">
                  <Icon name={h.icon} className="size-5" />
                </span>
                <div>
                  <p className="font-medium text-white">{h.title}</p>
                  <p className="mt-0.5 text-sm text-brand-200/80">{h.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200/60">Internal use only · Authorized personnel</p>
      </aside>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" />
            <span className="text-lg font-semibold tracking-tight">Vendor Management</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-500">Sign in with your account to continue.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                <Icon name="alertCircle" className="mt-0.5 size-4" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <div className="relative">
                <Icon
                  name="user"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="Enter your username"
                  className="input h-11 pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <div className="relative">
                <Icon
                  name="lock"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="input h-11 pr-11 pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-icon absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary h-11 w-full" disabled={submitting}>
              {submitting && <Spinner className="size-4 border-white/40 border-t-white" />}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Trouble signing in? Contact your administrator.
          </p>
        </div>
      </div>
    </main>
  );
}
