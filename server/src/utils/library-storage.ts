import path from 'node:path';
import type { StorageRepository } from 'src/repositories/storage.repository.js';

export type LibraryStorageCheck = { importPath: string; markerPath: string; expectedValue: string };
export type LibraryStorageState = { importPath: string; status: 'online' | 'offline' | 'error'; message?: string };
export type LibraryStorage = { importPaths: string[]; storageChecks?: LibraryStorageCheck[] };

export const isPathInImportPath = (filePath: string, importPath: string) => {
  const relative = path.relative(importPath, filePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export async function checkLibraryStorage(
  library: LibraryStorage,
  storage: Pick<StorageRepository, 'stat' | 'readFile'>,
): Promise<LibraryStorageState[]> {
  return Promise.all(
    library.importPaths.map(async (importPath): Promise<LibraryStorageState> => {
      try {
        const stat = await storage.stat(importPath);
        if (!stat.isDirectory()) {
          return { importPath, status: 'error', message: 'Import path is not a directory' };
        }
        const check = library.storageChecks?.find(
          (entry) => path.normalize(entry.importPath) === path.normalize(importPath),
        );
        if (check) {
          const buffer = Buffer.alloc(256);
          const value = await storage.readFile(check.markerPath, { buffer, length: buffer.length, position: 0 });
          if (value.toString('utf8').replace(/\0+$/, '').trim() !== check.expectedValue) {
            return { importPath, status: 'error', message: 'Storage identity does not match' };
          }
        }
        return { importPath, status: 'online' };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return ['ENOENT', 'ENOTDIR', 'ENODEV'].includes(code ?? '')
          ? { importPath, status: 'offline' }
          : { importPath, status: 'error', message: `Storage access failed (${code ?? 'unknown'})` };
      }
    }),
  );
}

export function isLibraryPathAvailable(filePath: string, states: LibraryStorageState[]) {
  const matching = states
    .filter(({ importPath }) => isPathInImportPath(filePath, importPath))
    .toSorted((a, b) => b.importPath.length - a.importPath.length);
  return matching[0]?.status === 'online';
}
