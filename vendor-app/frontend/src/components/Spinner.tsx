export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-slate-200 border-t-brand-600 ${className}`}
    />
  );
}
