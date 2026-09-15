import { readFileSync } from 'fs';
import path from 'path';

/**
 * The id of the build that this server runs, from the .next/BUILD_ID file that `next build` writes. Null when .next
 * has no build. The server reads the file one time. A deploy starts a new server process.
 */
export const BUILD_ID: string | null = (() => {
  try {
    return readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return null;
  }
})();
