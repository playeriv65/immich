import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "library" ADD "allowOffline" boolean NOT NULL DEFAULT false;`.execute(db);
  await sql`ALTER TABLE "library" ADD "storageChecks" jsonb NOT NULL DEFAULT '[]'::jsonb;`.execute(db);
  await sql`ALTER TABLE "library" ADD "storageStatus" jsonb NOT NULL DEFAULT '[]'::jsonb;`.execute(db);
  await sql`CREATE TABLE "library_job" (
  "libraryId" uuid NOT NULL,
  "assetId" uuid NOT NULL,
  "name" character varying NOT NULL,
  "job" jsonb NOT NULL,
  CONSTRAINT "library_job_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "library" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "library_job_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "library_job_pkey" PRIMARY KEY ("libraryId", "assetId", "name")
);`.execute(db);
  await sql`CREATE INDEX "library_job_libraryId_idx" ON "library_job" ("libraryId");`.execute(db);
  await sql`CREATE INDEX "library_job_assetId_idx" ON "library_job" ("assetId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "library" DROP COLUMN "allowOffline";`.execute(db);
  await sql`ALTER TABLE "library" DROP COLUMN "storageChecks";`.execute(db);
  await sql`ALTER TABLE "library" DROP COLUMN "storageStatus";`.execute(db);
  await sql`DROP TABLE "library_job";`.execute(db);
}
