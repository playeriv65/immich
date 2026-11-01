# Offline external storage

External originals can remain on a removable disk while the database, thumbnails and previews stay on internal storage. Filesystem access failures no longer move existing assets into trash. An unavailable original is marked offline and remains in the timeline. Explicit deletion and changes to library import paths or exclusions retain their existing behavior.

## Configure a removable library

1. Keep the database and the Immich media directory on storage that remains connected.
2. Mount the original directory read-only and add it as an external library.
3. Create a small identity file inside each import path using the host filesystem. Give it a unique value, for example a UUID. Keep that file when rearranging the library.
4. Edit the external library and enable **Allow storage to be offline**. For each import path, enter the identity file's absolute container path and its expected contents. The server reads this file and never creates or replaces it.
5. Scan the library while connected to generate previews. After reconnection, scan again to update availability and resume pending original-dependent jobs. Scheduled scans also perform this recovery.

An identity file distinguishes the expected disk from another disk mounted at the same path, and from an empty directory left behind after a mount disappears. The file must be inside the corresponding import path. A separate external library per removable disk makes configuration and reconnection easier to understand.

## Disconnected behavior

- Existing assets, albums, metadata and generated previews are retained.
- A disconnected library configured to allow offline storage displays an informational status.
- Cached previews can be browsed without connecting the original disk.
- Requests requiring an unavailable original explain that its storage needs to be connected.
- Sidecar, metadata, thumbnail and video-encoding jobs that need the unavailable source are saved in PostgreSQL. They resume on a subsequent scan and are removed from the pending list after successful processing.
- Permission errors, identity mismatches and I/O errors remain visible as storage problems.
- Disconnecting one import path does not suspend other available import paths.
- Normal Immich application storage checks remain enabled. Optional original storage and required database/media storage have different availability requirements.

An asset deliberately placed in trash stays there after its original storage returns. Offline status alone never starts a trash retention countdown. Existing trash entries created before upgrading are not automatically restored; review and restore those entries before their retention period expires.

## Preview storage

Use the existing [custom locations](./custom-locations.md) configuration to place generated previews on internal storage. Preview generation still uses Immich's image settings. This implementation does not add a cache size quota, automatic preview eviction or pinned originals. Do not manually remove the thumbnail directory to enforce a quota.

## Development validation

Use the repository's mise tasks. The focused tests are:

```sh
mise //server:test --run src/utils/file.spec.ts src/utils/library-storage.spec.ts src/services/library.service.spec.ts src/services/job.service.spec.ts src/services/asset-media.service.spec.ts src/services/download.service.spec.ts src/controllers/library.controller.spec.ts
mise //server:test-medium --run test/medium/specs/services/library.service.spec.ts
mise //web:test --run src/lib/utils.spec.ts src/lib/services/asset.service.spec.ts
```

The medium tests use real PostgreSQL and filesystem operations to verify album membership, preview retention, storage identity, restart recovery and pending-job persistence. A hardware test should additionally verify Docker's actual mount behavior using disposable copies before registering an existing photo library.
