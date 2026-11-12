import type { ReactNode } from "react";

import { Icon } from "./Icon";
import { Modal, ModalFooter } from "./Modal";
import { Spinner } from "./Spinner";

interface Props {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} busy={busy} size="sm" bare>
      <div className="flex gap-4 px-6 pt-6 pb-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 ring-8 ring-red-50/50">
          <Icon name="alertTriangle" className="size-5" />
        </div>
        <div className="pt-0.5">
          <h3 aria-hidden className="text-base font-semibold text-slate-900">
            {title}
          </h3>
          <div className="mt-1.5 text-sm leading-6 text-slate-600">{message}</div>
        </div>
      </div>
      <ModalFooter>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
          {busy && <Spinner className="size-4 border-white/40 border-t-white" />}
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}
