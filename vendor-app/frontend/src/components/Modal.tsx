import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "./Icon";

interface Props {
  title: string;
  /** Optional supporting line under the title. */
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Blocks Escape/backdrop close, e.g. while a request is in flight. */
  busy?: boolean;
  size?: "sm" | "lg";
  /** Hide the standard header, for dialogs that lay out their own (e.g. ConfirmDialog). */
  bare?: boolean;
}

export function Modal({
  title,
  description,
  onClose,
  children,
  busy = false,
  size = "lg",
  bare = false,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      "[autofocus], input, select, textarea, button:not([data-modal-close])",
    );
    first?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Keep the page behind the dialog from scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative my-auto w-full animate-pop-in rounded-2xl bg-white shadow-pop ring-1 ring-slate-900/5 ${
          size === "sm" ? "max-w-md" : "max-w-2xl"
        }`}
      >
        {bare ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 pt-5 pb-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              data-modal-close
              className="btn-icon -mr-2"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Standard footer bar for modal actions. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
