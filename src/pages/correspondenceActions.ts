/**
 * Pure UI rules for the correspondence desk (tested separately from the page).
 */
export function canSubmitForSignature(
  canPrepare: boolean,
  isSigner: boolean,
): boolean {
  if (!canPrepare) return false;
  if (isSigner) return false;
  return true;
}
