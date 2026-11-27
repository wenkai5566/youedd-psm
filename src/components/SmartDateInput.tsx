import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { parseFlexibleDateInput } from '../domain/bookingLogic';

interface SmartDateInputProps {
  id?: string;
  value: string;
  min?: string;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
  onChange: (validISO: string) => void;
}

/**
 * Date input supporting both fast manual keyboard entry (YYYY-MM-DD, YYYY/M/D, YYYYMMDD)
 * without browser segment lockups and one-tap native calendar selection.
 */
export function SmartDateInput({
  id,
  value,
  min,
  required,
  ariaLabel,
  className = '',
  onChange,
}: SmartDateInputProps) {
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  const displayedValue = editingDraft ?? value;

  const commitDraft = (raw: string) => {
    const parsed = parseFlexibleDateInput(raw);
    setEditingDraft(null);
    if (parsed && parsed !== value) {
      onChange(parsed);
    }
  };

  const openNativePicker = () => {
    const input = nativePickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* Fallback to focus/click below */
      }
    }
    input.focus();
    input.click();
  };

  return (
    <div className={`smart-date-wrap ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className="input smart-date-text tabular-nums"
        placeholder="YYYY-MM-DD 或 YYYYMMDD"
        aria-label={ariaLabel}
        required={required}
        value={displayedValue}
        onChange={(e) => {
          const next = e.target.value;
          setEditingDraft(next);
          if (next.trim().length === 8 || next.trim().length === 10) {
            const parsed = parseFlexibleDateInput(next);
            if (parsed) {
              setEditingDraft(null);
              if (parsed !== value) {
                onChange(parsed);
              }
            }
          }
        }}
        onBlur={() => commitDraft(displayedValue)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft(displayedValue);
          }
        }}
      />

      <button
        type="button"
        className="smart-date-btn"
        aria-label="開啟日曆挑選日期"
        title="開啟日曆"
        onClick={openNativePicker}
      >
        <Calendar size={16} />
      </button>

      <input
        ref={nativePickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="smart-date-native"
        value={value}
        min={min}
        onChange={(e) => {
          if (e.target.value) {
            setEditingDraft(null);
            onChange(e.target.value);
          }
        }}
      />
    </div>
  );
}
