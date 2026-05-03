import { useApp } from '../state.jsx';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

const typeIcon = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };

export default function ToastContainer() {
  const { toasts } = useApp();
  return (
    <div id="toast-container">
      {toasts.map(t => {
        const Icon = typeIcon[t.type] || Info;
        return (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon size={16} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
