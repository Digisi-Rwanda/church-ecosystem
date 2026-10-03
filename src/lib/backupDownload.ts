import { exportAllLocalData } from '../data/localDomainStore';

/** Save everything this browser holds as a JSON file (safety copy before data moves to the server). */
export function downloadLocalBackup(now: Date = new Date()): string {
  const json = JSON.stringify(exportAllLocalData(), null, 2);
  const name = `church-data-backup-${now.toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return name;
}
