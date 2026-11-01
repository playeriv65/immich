import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { parse } from 'node:path';
import sanitize from 'sanitize-filename';
import type { LibraryStorageState } from 'src/utils/library-storage.js';
import { StorageCore } from 'src/cores/storage.core.js';
import { AuthDto, isEditedOnly } from 'src/dtos/auth.dto.js';
import {
  DownloadArchiveDto,
  DownloadArchiveInfo,
  DownloadInfoDto,
  DownloadResponseDto,
} from 'src/dtos/download.dto.js';
import { Permission } from 'src/enum.js';
import { ImmichReadStream } from 'src/repositories/storage.repository.js';
import { BaseService } from 'src/services/base.service.js';
import { HumanReadableSize } from 'src/utils/bytes.js';
import { checkLibraryStorage, isLibraryPathAvailable } from 'src/utils/library-storage.js';
import { getPreferences } from 'src/utils/preferences.js';

@Injectable()
export class DownloadService extends BaseService {
  async getDownloadInfo(auth: AuthDto, dto: DownloadInfoDto): Promise<DownloadResponseDto> {
    let assets;

    if (dto.assetIds) {
      const assetIds = dto.assetIds;
      await this.requireAccess({ auth, permission: Permission.AssetDownload, ids: assetIds });
      assets = this.downloadRepository.downloadAssetIds(assetIds);
    } else if (dto.albumId) {
      const albumId = dto.albumId;
      await this.requireAccess({ auth, permission: Permission.AlbumDownload, ids: [albumId] });
      assets = this.downloadRepository.downloadAlbumId(albumId);
    } else if (dto.userId) {
      const userId = dto.userId;
      await this.requireAccess({ auth, permission: Permission.TimelineDownload, ids: [userId] });
      assets = this.downloadRepository.downloadUserId(userId);
    } else {
      throw new BadRequestException('assetIds, albumId, or userId is required');
    }

    const targetSize = dto.archiveSize || HumanReadableSize.GiB * 4;
    const metadata = await this.userRepository.getMetadata(auth.user.id);
    const preferences = getPreferences(metadata);
    const motionIds = new Set<string>();
    const archives: DownloadArchiveInfo[] = [];
    let archive: DownloadArchiveInfo = { size: 0, assetIds: [] };

    const addToArchive = ({ id, size }: { id: string; size: number | null }) => {
      archive.assetIds.push(id);
      archive.size += Number(size || 0);

      if (archive.size <= targetSize) {
        return;
      }

      archives.push(archive);
      archive = { size: 0, assetIds: [] };
    };

    for await (const asset of assets) {
      // motion part of live photos
      if (asset.livePhotoVideoId) {
        motionIds.add(asset.livePhotoVideoId);
      }

      addToArchive(asset);
    }

    if (motionIds.size > 0) {
      const motionAssets = this.downloadRepository.downloadMotionAssetIds([...motionIds]);
      for await (const motionAsset of motionAssets) {
        if (StorageCore.isAndroidMotionPath(motionAsset.originalPath) && !preferences.download.includeEmbeddedVideos) {
          continue;
        }

        addToArchive(motionAsset);
      }
    }

    if (archive.assetIds.length > 0) {
      archives.push(archive);
    }

    let totalSize = 0;
    for (const archive of archives) {
      totalSize += archive.size;
    }

    return { totalSize, archives };
  }

  async downloadArchive(auth: AuthDto, dto: DownloadArchiveDto): Promise<ImmichReadStream> {
    await this.requireAccess({ auth, permission: Permission.AssetDownload, ids: dto.assetIds });

    const edited = isEditedOnly(auth, dto.edited);
    const assets = await this.assetRepository.getForOriginals(dto.assetIds, edited);
    const storageByLibrary = new Map<string, LibraryStorageState[]>();
    for (const asset of assets) {
      if (edited && asset.editedPath) {
        continue;
      }
      if (asset.libraryId && !storageByLibrary.has(asset.libraryId)) {
        const library = await this.libraryRepository.get(asset.libraryId);
        if (library && (library.allowOffline || library.storageChecks.length > 0)) {
          storageByLibrary.set(library.id, await checkLibraryStorage(library, this.storageRepository));
        } else {
          storageByLibrary.set(asset.libraryId, []);
        }
      }
      const states = asset.libraryId ? storageByLibrary.get(asset.libraryId) : undefined;
      if (states?.length ? !isLibraryPathAvailable(asset.originalPath, states) : asset.isOffline) {
        throw new ConflictException('Original storage is offline. Connect the storage to download this archive.');
      }
    }
    const zip = this.storageRepository.createZipStream();
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    const paths: Record<string, number> = {};

    for (const assetId of dto.assetIds) {
      const asset = assetMap.get(assetId);
      if (!asset) {
        continue;
      }

      const { originalPath, editedPath, originalFileName } = asset;

      let filename = sanitize(originalFileName) || 'unnamed';
      const count = paths[filename] || 0;
      paths[filename] = count + 1;
      if (count !== 0) {
        const parsedFilename = parse(filename);
        filename = `${parsedFilename.name}+${count}${parsedFilename.ext}`;
      }

      let realpath = edited && editedPath ? editedPath : originalPath;

      try {
        realpath = await this.storageRepository.realpath(realpath);
      } catch {
        this.logger.warn('Unable to resolve realpath', { originalPath });
      }

      zip.addFile(realpath, filename);
    }

    void zip.finalize();

    return {
      stream: zip.stream,
      disposition: dto.archiveName && `attachment; filename*=UTF-8''${encodeURIComponent(dto.archiveName)}.zip`,
    };
  }
}
