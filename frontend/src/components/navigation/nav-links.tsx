import Link from 'next/link';

import { cn } from '@/lib/cn';
import { isActivePath, PRIMARY_NAV, PROFILE_NAV } from '@/lib/navigation';

/** Presentational navigation; `AppNav` supplies the current path. */
export function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:pb-0"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5 md:flex md:items-center md:gap-1">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 items-center justify-center px-1 text-xs font-medium md:min-h-11 md:rounded-lg md:px-3 md:text-sm',
                  active
                    ? 'text-brand md:bg-surface-muted'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ProfileLink({ pathname }: { pathname: string }) {
  const active = isActivePath(pathname, PROFILE_NAV.href);
  return (
    <Link
      href={PROFILE_NAV.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center rounded-lg px-3 text-sm font-medium',
        active ? 'bg-surface-muted text-brand' : 'text-muted hover:text-foreground',
      )}
    >
      {PROFILE_NAV.label}
    </Link>
  );
}
