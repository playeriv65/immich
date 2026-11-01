import { Injectable } from '@nestjs/common';
import { type Insertable, type Kysely, type Updateable, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type { JobItem } from 'src/types.js';
import type { LibraryStorageState } from 'src/utils/library-storage.js';
import { DummyValue, GenerateSql } from 'src/decorators.js';
import { LibraryStatsResponseDto } from 'src/dtos/library.dto.js';
import { AssetType, AssetVisibility } from 'src/enum.js';
import { DB } from 'src/schema/index.js';
import { LibraryTable } from 'src/schema/tables/library.table.js';
import { asUuid } from 'src/utils/database.js';

export enum AssetSyncResult {
  DO_NOTHING,
  UPDATE,
  OFFLINE,
  CHECK_OFFLINE,
}

@Injectable()
export class LibraryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByAssetId(assetId: string) {
    return this.db
      .selectFrom('library')
      .innerJoin('asset', 'asset.libraryId', 'library.id')
      .selectAll('library')
      .select('asset.originalPath')
      .where('asset.id', '=', asUuid(assetId))
      .where('library.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async updateStorageStatus(id: string, states: LibraryStorageState[]) {
    await this.db
      .updateTable('library')
      .set({ storageStatus: sql<LibraryStorageState[]>`${states}::jsonb` })
      .where('id', '=', asUuid(id))
      .where(sql<boolean>`"storageStatus" IS DISTINCT FROM ${states}::jsonb`)
      .execute();
  }

  async deferJob(libraryId: string, assetId: string, job: JobItem) {
    await this.db
      .insertInto('library_job')
      .values({ libraryId, assetId, name: job.name, job: sql<Record<string, unknown>>`${job}::jsonb` })
      .onConflict((conflict) =>
        conflict
          .columns(['libraryId', 'assetId', 'name'])
          .doUpdateSet({ job: sql<Record<string, unknown>>`${job}::jsonb` }),
      )
      .execute();
  }

  getDeferredJobs(libraryId: string) {
    return this.db
      .selectFrom('library_job')
      .innerJoin('asset', 'asset.id', 'library_job.assetId')
      .select(['library_job.assetId', 'library_job.name', 'library_job.job', 'asset.originalPath'])
      .where('library_job.libraryId', '=', asUuid(libraryId))
      .where('asset.deletedAt', 'is', null)
      .stream();
  }

  async deleteDeferredJob(libraryId: string, assetId: string, name: string) {
    await this.db
      .deleteFrom('library_job')
      .where('libraryId', '=', asUuid(libraryId))
      .where('assetId', '=', asUuid(assetId))
      .where('name', '=', name)
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  get(id: string, withDeleted = false) {
    return this.db
      .selectFrom('library')
      .selectAll('library')
      .where('library.id', '=', id)
      .$if(!withDeleted, (qb) => qb.where('library.deletedAt', 'is', null))
      .executeTakeFirst();
  }

  @GenerateSql({ params: [] })
  getAll(withDeleted = false) {
    return this.db
      .selectFrom('library')
      .selectAll('library')
      .orderBy('createdAt', 'asc')
      .$if(!withDeleted, (qb) => qb.where('library.deletedAt', 'is', null))
      .execute();
  }

  @GenerateSql()
  getAllDeleted() {
    return this.db
      .selectFrom('library')
      .selectAll('library')
      .where('library.deletedAt', 'is not', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  create(library: Insertable<LibraryTable>) {
    return this.db.insertInto('library').values(library).returningAll().executeTakeFirstOrThrow();
  }

  async delete(id: string) {
    await this.db.deleteFrom('library').where('library.id', '=', id).execute();
  }

  async softDelete(id: string) {
    await this.db.updateTable('library').set({ deletedAt: new Date() }).where('library.id', '=', id).execute();
  }

  update(id: string, library: Updateable<LibraryTable>) {
    return this.db
      .updateTable('library')
      .set(library)
      .where('library.id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getStatistics(id: string): Promise<LibraryStatsResponseDto | undefined> {
    const stats = await this.db
      .selectFrom('library')
      .innerJoin('asset', 'asset.libraryId', 'library.id')
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .select((eb) =>
        eb.fn
          .countAll<number>()
          .filterWhere((eb) =>
            eb.and([eb('asset.type', '=', AssetType.Image), eb('asset.visibility', '!=', AssetVisibility.Hidden)]),
          )
          .as('photos'),
      )
      .select((eb) =>
        eb.fn
          .countAll<number>()
          .filterWhere((eb) =>
            eb.and([eb('asset.type', '=', AssetType.Video), eb('asset.visibility', '!=', AssetVisibility.Hidden)]),
          )
          .as('videos'),
      )
      .select((eb) => eb.fn.coalesce((eb) => eb.fn.sum('asset_exif.fileSizeInByte'), eb.val(0)).as('usage'))
      .where('asset.deletedAt', 'is', null)
      .groupBy('library.id')
      .where('library.id', '=', id)
      .executeTakeFirst();

    // possibly a new library with 0 assets
    if (!stats) {
      const zero = sql<number>`0::int`;
      return this.db
        .selectFrom('library')
        .select(zero.as('photos'))
        .select(zero.as('videos'))
        .select(zero.as('usage'))
        .select(zero.as('total'))
        .where('library.id', '=', id)
        .executeTakeFirst();
    }

    return {
      photos: stats.photos,
      videos: stats.videos,
      usage: stats.usage,
      total: stats.photos + stats.videos,
    };
  }

  streamAssetIds(libraryId: string) {
    return this.db.selectFrom('asset').select(['id']).where('libraryId', '=', libraryId).stream();
  }
}
