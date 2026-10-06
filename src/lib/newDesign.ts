/**
 * The new design is the app people see. It stays switchable for one reason: setting
 * VITE_NEW_DESIGN=false on a site brings the old screens back, in case something must be
 * compared. With nothing set, the new design is on.
 */
export function isNewDesign(): boolean {
  return import.meta.env.VITE_NEW_DESIGN !== 'false';
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
