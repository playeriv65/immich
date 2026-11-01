import { createZodDto } from 'nestjs-zod';
import path from 'node:path';
import z from 'zod';
import { Library } from 'src/database.js';
import { isPathInImportPath } from 'src/utils/library-storage.js';
import { isoDatetimeToDate } from 'src/validation.js';

const storageCheckSchema = z
  .object({
    importPath: z.string().refine(path.isAbsolute, 'Import path must be absolute'),
    markerPath: z.string().refine(path.isAbsolute, 'Marker path must be absolute'),
    expectedValue: z.string().trim().min(1).max(128),
  })
  .refine((check) => isPathInImportPath(check.markerPath, check.importPath), 'Marker must be inside its import path');

const storageChecksSchema = z
  .array(storageCheckSchema)
  .max(128)
  .refine(
    (checks) => new Set(checks.map(({ importPath }) => path.normalize(importPath))).size === checks.length,
    'Storage checks must have unique import paths',
  );

const storageStatusSchema = z.object({
  importPath: z.string(),
  status: z.enum(['online', 'offline', 'error']),
  message: z.string().optional(),
});

const stringArrayMax128 = z
  .array(z.string())
  .max(128)
  .refine((arr) => arr.every((s) => s.trim() !== ''), 'Array items must not be empty')
  .refine((arr) => new Set(arr).size === arr.length, 'Array must have unique items');

const CreateLibrarySchema = z
  .object({
    ownerId: z.uuidv4().describe('Owner user ID'),
    allowOffline: z.boolean().optional().describe('Allow storage to be disconnected during normal use'),
    storageChecks: storageChecksSchema.optional().describe('Read-only storage identity checks'),
    name: z.string().min(1).optional().describe('Library name'),
    importPaths: stringArrayMax128.optional().describe('Import paths (max 128)'),
    exclusionPatterns: stringArrayMax128.optional().describe('Exclusion patterns (max 128)'),
  })
  .meta({ id: 'CreateLibraryDto' });

const UpdateLibrarySchema = z
  .object({
    allowOffline: z.boolean().optional().describe('Allow storage to be disconnected during normal use'),
    storageChecks: storageChecksSchema.optional().describe('Read-only storage identity checks'),
    name: z.string().min(1).optional().describe('Library name'),
    importPaths: stringArrayMax128.optional().describe('Import paths (max 128)'),
    exclusionPatterns: stringArrayMax128.optional().describe('Exclusion patterns (max 128)'),
  })
  .meta({ id: 'UpdateLibraryDto' });

export interface CrawlOptionsDto {
  pathsToCrawl: string[];
  includeHidden?: boolean;
  exclusionPatterns?: string[];
}

export interface WalkOptionsDto extends CrawlOptionsDto {
  take: number;
}

const ValidateLibrarySchema = z
  .object({
    importPaths: stringArrayMax128.optional().describe('Import paths to validate (max 128)'),
    exclusionPatterns: stringArrayMax128.optional().describe('Exclusion patterns (max 128)'),
  })
  .meta({ id: 'ValidateLibraryDto' });

const ValidateLibraryImportPathResponseSchema = z
  .object({
    importPath: z.string().describe('Import path'),
    isValid: z.boolean().describe('Is valid'),
    message: z.string().optional().describe('Validation message'),
  })
  .meta({ id: 'ValidateLibraryImportPathResponseDto' });

const ValidateLibraryResponseSchema = z
  .object({
    importPaths: z
      .array(ValidateLibraryImportPathResponseSchema)
      .optional()
      .describe('Validation results for import paths'),
  })
  .meta({ id: 'ValidateLibraryResponseDto' });

const LibraryResponseSchema = z
  .object({
    allowOffline: z.boolean().optional(),
    storageChecks: storageChecksSchema.optional(),
    storageStatus: z.array(storageStatusSchema).optional(),
    id: z.uuidv4().describe('Library ID'),
    ownerId: z.uuidv4().describe('Owner user ID'),
    name: z.string().describe('Library name'),
    assetCount: z.int().describe('Number of assets'),
    importPaths: z.array(z.string()).describe('Import paths'),
    exclusionPatterns: z.array(z.string()).describe('Exclusion patterns'),
    createdAt: isoDatetimeToDate.describe('Creation date'),
    updatedAt: isoDatetimeToDate.describe('Last update date'),
    refreshedAt: isoDatetimeToDate.nullable().describe('Last refresh date'),
  })
  .meta({ id: 'LibraryResponseDto' });

const LibraryStatsResponseSchema = z
  .object({
    photos: z.int().describe('Number of photos'),
    videos: z.int().describe('Number of videos'),
    total: z.int().describe('Total number of assets'),
    usage: z.int().describe('Storage usage in bytes'),
  })
  .meta({ id: 'LibraryStatsResponseDto' });

export class CreateLibraryDto extends createZodDto(CreateLibrarySchema) {}
export class UpdateLibraryDto extends createZodDto(UpdateLibrarySchema) {}
export class ValidateLibraryDto extends createZodDto(ValidateLibrarySchema) {}
export class ValidateLibraryResponseDto extends createZodDto(ValidateLibraryResponseSchema) {}
export class ValidateLibraryImportPathResponseDto extends createZodDto(ValidateLibraryImportPathResponseSchema) {}
export class LibraryResponseDto extends createZodDto(LibraryResponseSchema) {}
export class LibraryStatsResponseDto extends createZodDto(LibraryStatsResponseSchema) {}

export function mapLibrary(entity: Library): LibraryResponseDto {
  const assetCount = entity.assets ? entity.assets.length : 0;
  return {
    id: entity.id,
    ownerId: entity.ownerId,
    name: entity.name,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    refreshedAt: entity.refreshedAt,
    assetCount,
    importPaths: entity.importPaths,
    exclusionPatterns: entity.exclusionPatterns,
    allowOffline: entity.allowOffline,
    storageChecks: entity.storageChecks,
    storageStatus: entity.storageStatus,
  };
}
