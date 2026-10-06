/**
 * The new-design switch. Off by default and off on staging, so the old app keeps
 * working while the new front door is built beside it. Turn it on with
 * VITE_NEW_DESIGN=true on the site you want to try it on.
 */
export function isNewDesign(): boolean {
  return import.meta.env.VITE_NEW_DESIGN === 'true';
}

/** True for the screens of the new front door (sign-in, Portal and the system frame). */
export function isNewDoorPath(pathname: string): boolean {
  return (
    pathname === '/signin' ||
    pathname === '/portal' ||
    pathname.startsWith('/portal/') ||
    pathname === '/s' ||
    pathname.startsWith('/s/')
  );
}
