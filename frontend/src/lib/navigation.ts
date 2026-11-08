/** App-wide navigation. Lanes add pages under these sections, not new tabs. */

export interface NavItem {
  href: string;
  label: string;
}

/** Bottom tab bar on phones, header links on wider screens. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', label: 'Today' },
  { href: '/routines', label: 'Routines' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/exercises', label: 'Exercises' },
  { href: '/history', label: 'History' },
];

export const PROFILE_NAV: NavItem = { href: '/profile', label: 'Profile' };

/** `/` matches only itself; other sections also match their sub-pages. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
