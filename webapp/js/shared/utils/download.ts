/**
 * Client-side file download helpers.
 *
 * Bearer-authed API responses can't be downloaded by pointing the browser at a
 * URL (a navigation carries no Authorization header), so endpoints that produce
 * a file return its body and the client materializes it into a Blob and clicks a
 * synthetic `<a download>`. Used by the words-list export (POST
 * /api/v1/terms/export) and available to any other fetch-and-save flow.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * Trigger a browser download of in-memory text content.
 *
 * @param filename Suggested download filename.
 * @param content  The file body.
 * @param mime     MIME type (defaults to UTF-8 plain text).
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoke on the next tick so the click has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
