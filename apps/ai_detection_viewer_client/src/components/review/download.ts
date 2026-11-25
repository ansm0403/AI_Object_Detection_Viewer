/**
 * Hand a piece of text to the browser as a file download (F4 export).
 *
 * There is no backend, so the file is built in the page: the text becomes a
 * Blob, a temporary object URL points at it, and a programmatic click on an
 * `<a download>` saves it. The URL is revoked afterwards so the Blob can be
 * freed. Only the browser plumbing lives here — WHAT goes into the file is
 * built by the pure functions in `lib/review/export`.
 */
export function downloadTextFile(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on a later tick: some browsers start reading the Blob after click().
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * UTF-8 byte-order mark. Excel opens a CSV as the system code page unless the
 * file starts with this, which would garble any non-ASCII note text. It is
 * added at download time only — the CSV text itself stays plain.
 */
export const UTF8_BOM = '﻿';
