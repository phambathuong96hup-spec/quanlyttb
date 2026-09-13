import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  required?: boolean;
}

export function useActionPrompt() {
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const resolveRef = useRef<((value: string | null) => void) | null>(null);
  const id = useId();
  useEffect(() => () => { resolveRef.current?.(null); }, []);

  const ask = useCallback((next: PromptOptions) => {
    resolveRef.current?.(null);
    setValue('');
    setError('');
    setOptions(next);
    return new Promise<string | null>(resolve => { resolveRef.current = resolve; });
  }, []);
  const finish = (result: string | null) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  };

  const dialog = options && (
    <Modal isOpen onClose={() => finish(null)} title={options.title} size="sm">
      <form onSubmit={event => {
        event.preventDefault();
        if (options.required && !value.trim()) {
          setError('Vui lòng nhập lý do trước khi xác nhận.');
          return;
        }
        finish(value.trim());
      }}>
        {options.description && <p>{options.description}</p>}
        {options.label && <>
          <label htmlFor={id}>{options.label}</label>
          <textarea id={id} rows={4} value={value} onChange={event => setValue(event.target.value)}
            aria-required={options.required} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 12, font: 'inherit' }} />
        </>}
        {error && <p id={`${id}-error`} role="alert">{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={() => finish(null)}>Hủy</Button>
          <Button type="submit">Xác nhận</Button>
        </div>
      </form>
    </Modal>
  );
  return { ask, dialog };
}
