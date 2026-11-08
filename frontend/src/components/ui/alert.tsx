import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<AlertTone, string> = {
  info: 'border-border bg-surface-muted',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
};

/**
 * A message that is announced to screen readers. Errors interrupt (`alert`);
 * everything else waits politely (`status`). Only show `success` after the
 * server has confirmed the save.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-2 rounded-lg border bg-surface p-4', TONES[tone])}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className="text-sm text-foreground">{children}</div> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
