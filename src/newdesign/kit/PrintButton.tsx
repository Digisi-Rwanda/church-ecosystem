import { useT } from '../../i18n/I18nContext';

/**
 * "Save as PDF": opens the print sheet, where every phone and computer offers Save as PDF.
 * The shell hides its menus when printing and adds a header with the church, the place and the date.
 */
export function PrintButton({ className = 'btn ghost no-print' }: { className?: string }) {
  const t = useT();
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {t('door.print.pdf')}
    </button>
  );
}
