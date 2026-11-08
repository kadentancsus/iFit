'use client';

import { usePathname } from 'next/navigation';

import { NavLinks, ProfileLink } from './nav-links';

export function AppNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function AppProfileLink() {
  return <ProfileLink pathname={usePathname()} />;
}
