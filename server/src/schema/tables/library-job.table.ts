import { Column, ForeignKeyColumn, Table } from '@immich/sql-tools';
import { AssetTable } from 'src/schema/tables/asset.table.js';
import { LibraryTable } from 'src/schema/tables/library.table.js';

@Table('library_job')
export class LibraryJobTable {
  @ForeignKeyColumn(() => LibraryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  libraryId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  assetId!: string;

  @Column({ primary: true })
  name!: string;

  @Column({ type: 'jsonb' })
  job!: Record<string, unknown>;
}
