import { useId, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Help shown under the input, e.g. "Per dumbbell, in lb". */
  hint?: string;
  /** Validation message; marks the input invalid and is read by screen readers. */
  error?: string | null;
}

/** A labeled input with its hint and error wired up for assistive technology. */
export function TextField({ label, hint, error, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 rounded-lg border bg-surface px-3 text-base text-foreground',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
