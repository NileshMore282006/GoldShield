import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

const icons = { success: CheckCircle, warning: AlertTriangle, error: XCircle, info: Info };
const sizes = { success: 16, warning: 16, error: 16, info: 16 };

export default function AlertBox({ type = 'info', children, className = '' }) {
  const Icon = icons[type] || Info;
  return (
    <div className={`alert-box ${type} ${className}`}>
      <span className="alert-icon"><Icon size={16} strokeWidth={2} /></span>
      <span>{children}</span>
    </div>
  );
}
