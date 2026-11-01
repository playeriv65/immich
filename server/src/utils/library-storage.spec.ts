import { Stats } from 'node:fs';
import { vitest } from 'vitest';
import { checkLibraryStorage, isLibraryPathAvailable, isPathInImportPath } from 'src/utils/library-storage.js';

describe('external library storage', () => {
  const library = {
    importPaths: ['/photos', '/camera'],
    storageChecks: [{ importPath: '/photos', markerPath: '/photos/identity', expectedValue: 'disk-a' }],
  };
  const directory = { isDirectory: () => true } as Stats;

  it('recognizes the expected disk and another independent import path', async () => {
    const storage = {
      stat: vitest.fn().mockResolvedValue(directory),
      readFile: vitest.fn().mockResolvedValue(Buffer.from('disk-a\n')),
    };
    const states = await checkLibraryStorage(library, storage);
    expect(states).toEqual([
      { importPath: '/photos', status: 'online' },
      { importPath: '/camera', status: 'online' },
    ]);
    expect(isLibraryPathAvailable('/photos/image.jpg', states)).toBe(true);
  });

  it.each(['ENOENT', 'ENOTDIR', 'ENODEV'])(
    'handles a disconnected disk (%s) without affecting another disk',
    async (code) => {
      const storage = {
        stat: vitest.fn().mockImplementation((name) => {
          if (name === '/photos') {
            return Promise.reject(Object.assign(new Error('missing'), { code }));
          }
          return Promise.resolve(directory);
        }),
        readFile: vitest.fn(),
      };
      const states = await checkLibraryStorage(library, storage);
      expect(states).toEqual([
        { importPath: '/photos', status: 'offline' },
        { importPath: '/camera', status: 'online' },
      ]);
      expect(isLibraryPathAvailable('/photos/image.jpg', states)).toBe(false);
      expect(isLibraryPathAvailable('/camera/image.jpg', states)).toBe(true);
      expect(storage.readFile).not.toHaveBeenCalled();
    },
  );

  it('detects an empty leftover mount directory by its missing identity marker', async () => {
    const storage = {
      stat: vitest.fn().mockResolvedValue(directory),
      readFile: vitest.fn().mockRejectedValue(Object.assign(new Error('Storage unavailable'), { code: 'ENOENT' })),
    };
    const states = await checkLibraryStorage(library, storage);
    expect(states[0]).toEqual({ importPath: '/photos', status: 'offline' });
  });

  it('rejects a different disk at the same path', async () => {
    const storage = {
      stat: vitest.fn().mockResolvedValue(directory),
      readFile: vitest.fn().mockResolvedValue(Buffer.from('disk-b')),
    };
    const states = await checkLibraryStorage(library, storage);
    expect(states[0]).toEqual({
      importPath: '/photos',
      status: 'error',
      message: 'Storage identity does not match',
    });
  });

  it.each(['EACCES', 'EIO'])('keeps actual storage failures visible (%s)', async (code) => {
    const storage = {
      stat: vitest.fn().mockRejectedValue(Object.assign(new Error('Storage unavailable'), { code })),
      readFile: vitest.fn(),
    };
    const states = await checkLibraryStorage(library, storage);
    expect(states[0]).toEqual({
      importPath: '/photos',
      status: 'error',
      message: `Storage access failed (${code})`,
    });
  });

  it('does not match sibling prefixes or traversal outside the import path', () => {
    expect(isPathInImportPath('/photos-other/a.jpg', '/photos')).toBe(false);
    expect(isPathInImportPath('/photos/../private/a.jpg', '/photos')).toBe(false);
    expect(isLibraryPathAvailable('/photos-other/a.jpg', [{ importPath: '/photos', status: 'online' }])).toBe(false);
  });

  it('uses the most specific configured root for nested mounts', () => {
    expect(
      isLibraryPathAvailable('/photos/camera/a.jpg', [
        { importPath: '/photos', status: 'online' },
        { importPath: '/photos/camera', status: 'offline' },
      ]),
    ).toBe(false);
  });
});
