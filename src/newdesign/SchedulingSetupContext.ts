import { createContext } from 'react';

/** `saved` clears the page's dirty flag after a successful save; `changed` sets it. Saves are live, so there is no draft state here. */
export const SchedulingSetupContext = createContext({ saved: () => {}, changed: () => {} });
