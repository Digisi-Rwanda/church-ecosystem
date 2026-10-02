/** Why the last sign-in did not use the server (shown in the sync badge). */
let note = '';
export const setLoginNote = (s: string) => {
  note = s;
};
export const getLoginNote = () => note;
