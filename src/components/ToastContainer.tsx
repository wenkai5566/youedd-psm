import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastItem } from '../types/domain';

interface ToastContainerProps {
  toasts: ToastItem[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item toast-${toast.tone}`}>
          {toast.tone === 'success' && <CheckCircle2 size={16} />}
          {toast.tone === 'error' && <AlertCircle size={16} />}
          {toast.tone === 'info' && <Info size={16} />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
