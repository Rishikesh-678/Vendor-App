import { createContext, use, useCallback, useState, type ReactNode } from "react";

import { Icon } from "./Icon";

type Kind = "success" | "error";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<((kind: Kind, message: string) => void) | null>(null);

let nextId = 1;

const STYLE = {
  success: { icon: "checkCircle", tint: "bg-emerald-50 text-emerald-600", title: "Success" },
  error: { icon: "alertCircle", tint: "bg-red-50 text-red-600", title: "Something went wrong" },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId++;
      setToasts((ts) => [...ts, { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => {
          const s = STYLE[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-3 rounded-xl bg-white p-4 text-sm shadow-pop ring-1 ring-slate-900/5"
            >
              <span className={`flex size-8 items-center justify-center rounded-full ${s.tint}`}>
                <Icon name={s.icon} className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-medium text-slate-900">{s.title}</p>
                <p className="mt-0.5 break-words text-slate-600">{t.message}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="btn-icon -mt-1 -mr-1 size-7"
                onClick={() => dismiss(t.id)}
              >
                <Icon name="x" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const show = use(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
