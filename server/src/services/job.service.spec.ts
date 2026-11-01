import { Stats } from 'node:fs';
import type { JobItem } from 'src/types.js';
import { AssetType, ImmichWorker, JobName, JobStatus, QueueName } from 'src/enum.js';
import { JobService } from 'src/services/job.service.js';
import { AssetFactory } from 'test/factories/asset.factory.js';
import { factory, newUuid } from 'test/small.factory.js';
import { ServiceMocks, newTestService } from 'test/utils.js';

describe(JobService.name, () => {
  let sut: JobService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(JobService));
    mocks.library.getByAssetId.mockResolvedValue(undefined);

    mocks.config.getWorker.mockReturnValue(ImmichWorker.Microservices);
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('onJobRun', () => {
    it('persists original-dependent work without failure or follow-up jobs while offline', async () => {
      const library = {
        ...factory.library({ allowOffline: true, importPaths: ['/disk'] }),
        originalPath: '/disk/a.jpg',
      };
      const job: JobItem = { name: JobName.SidecarCheck, data: { id: newUuid(), source: 'upload' } };
      mocks.library.getByAssetId.mockResolvedValue(library);
      mocks.library.updateStorageStatus.mockResolvedValue();
      mocks.library.deferJob.mockResolvedValue();
      mocks.storage.stat.mockRejectedValue(Object.assign(new Error('Storage unavailable'), { code: 'ENOENT' }));

      await sut.onJobRun(QueueName.Sidecar, job);

      expect(mocks.library.deferJob).toHaveBeenCalledWith(library.id, job.data.id, job);
      expect(mocks.job.run).not.toHaveBeenCalled();
      expect(mocks.job.queue).not.toHaveBeenCalled();
      expect(mocks.event.emit).not.toHaveBeenCalledWith('JobError', expect.anything());
      expect(mocks.event.emit).not.toHaveBeenCalledWith('JobSuccess', expect.anything());
      expect(mocks.logger.error).not.toHaveBeenCalled();
    });

    it('defers a job if the disk disconnects during execution', async () => {
      const library = {
        ...factory.library({ allowOffline: true, importPaths: ['/disk'] }),
        originalPath: '/disk/a.jpg',
      };
      const job: JobItem = { name: JobName.AssetExtractMetadata, data: { id: newUuid() } };
      mocks.library.getByAssetId.mockResolvedValue(library);
      mocks.library.updateStorageStatus.mockResolvedValue();
      mocks.library.deferJob.mockResolvedValue();
      mocks.storage.stat
        .mockResolvedValueOnce({ isDirectory: () => true } as Stats)
        .mockRejectedValue(Object.assign(new Error('Storage unavailable'), { code: 'ENOENT' }));
      mocks.job.run.mockRejectedValue(new Error('Original disappeared'));

      await sut.onJobRun(QueueName.MetadataExtraction, job);

      expect(mocks.library.deferJob).toHaveBeenCalledWith(library.id, job.data.id, job);
      expect(mocks.event.emit).not.toHaveBeenCalledWith('JobError', expect.anything());
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });

    it.each([JobStatus.Success, JobStatus.Skipped, undefined, JobStatus.Failed])(
      'handles a resumed job completion result %s',
      async (response) => {
        const library = {
          ...factory.library({ allowOffline: true, importPaths: ['/disk'] }),
          originalPath: '/disk/a.jpg',
        };
        const job: JobItem = { name: JobName.SidecarCheck, data: { id: newUuid(), libraryResume: true } };
        mocks.library.getByAssetId.mockResolvedValue(library);
        mocks.library.updateStorageStatus.mockResolvedValue();
        mocks.library.deleteDeferredJob.mockResolvedValue();
        mocks.storage.stat.mockResolvedValue({ isDirectory: () => true } as Stats);
        mocks.job.run.mockResolvedValue(response);

        await sut.onJobRun(QueueName.Sidecar, job);

        if (response === JobStatus.Failed) {
          expect(mocks.library.deleteDeferredJob).not.toHaveBeenCalled();
        } else {
          expect(mocks.library.deleteDeferredJob).toHaveBeenCalledWith(library.id, job.data.id, job.name);
        }
      },
    );

    it('should queue metadata extraction when sidecar discovery is skipped', async () => {
      const job: JobItem = { name: JobName.SidecarCheck, data: { id: 'asset-1', source: 'upload' } };
      mocks.job.run.mockResolvedValue(JobStatus.Skipped);

      await sut.onJobRun(QueueName.Sidecar, job);

      expect(mocks.job.queue).toHaveBeenCalledExactlyOnceWith({
        name: JobName.AssetExtractMetadata,
        data: job.data,
      });
    });

    it('should process a successful job', async () => {
      mocks.job.run.mockResolvedValue(JobStatus.Success);

      const job: JobItem = { name: JobName.FileDelete, data: { files: ['path/to/file'] } };
      await sut.onJobRun(QueueName.BackgroundTask, job);

      expect(mocks.event.emit).toHaveBeenCalledWith('JobStart', QueueName.BackgroundTask, job);
      expect(mocks.event.emit).toHaveBeenCalledWith('JobSuccess', { job, response: JobStatus.Success });
      expect(mocks.event.emit).toHaveBeenCalledWith('JobComplete', QueueName.BackgroundTask, job);
      expect(mocks.logger.error).not.toHaveBeenCalled();
    });

    it.each([JobStatus.Success, JobStatus.Skipped])(
      'should queue metadata extraction after a %s sidecar check and preserve its source',
      async (status) => {
        mocks.job.run.mockResolvedValue(status);
        const job: JobItem = { name: JobName.SidecarCheck, data: { id: 'asset-1', source: 'upload' } };

        await sut.onJobRun(QueueName.Sidecar, job);

        expect(mocks.job.queue).toHaveBeenCalledExactlyOnceWith({
          name: JobName.AssetExtractMetadata,
          data: { id: 'asset-1', source: 'upload' },
        });
        expect(mocks.job.queueAll).not.toHaveBeenCalled();
      },
    );

    it('should not queue metadata extraction after a failed sidecar check', async () => {
      mocks.job.run.mockResolvedValue(JobStatus.Failed);

      await sut.onJobRun(QueueName.Sidecar, { name: JobName.SidecarCheck, data: { id: 'asset-1', source: 'upload' } });

      expect(mocks.job.queue).not.toHaveBeenCalled();
      expect(mocks.job.queueAll).not.toHaveBeenCalled();
    });

    const tests: Array<{ item: JobItem; jobs: JobName[]; stub?: any }> = [
      {
        item: { name: JobName.StorageTemplateMigrationSingle, data: { id: 'asset-1', source: 'upload' } },
        jobs: [JobName.AssetGenerateThumbnails],
      },
      {
        item: { name: JobName.StorageTemplateMigrationSingle, data: { id: 'asset-1' } },
        jobs: [],
      },
      {
        item: { name: JobName.PersonGenerateThumbnail, data: { ownerId: 'owner-1', personGroupId: 'person-group-1' } },
        jobs: [],
      },
      {
        item: { name: JobName.AssetGenerateThumbnails, data: { id: 'asset-1' } },
        jobs: [],
        stub: [AssetFactory.create({ id: 'asset-1' })],
      },
      {
        item: { name: JobName.AssetGenerateThumbnails, data: { id: 'asset-1' } },
        jobs: [],
        stub: [AssetFactory.create({ id: 'asset-1', type: AssetType.Video })],
      },
      {
        item: { name: JobName.AssetGenerateThumbnails, data: { id: 'asset-1', source: 'upload' } },
        jobs: [JobName.SmartSearch, JobName.AssetDetectFaces, JobName.Ocr],
        stub: [AssetFactory.create({ id: 'asset-1', livePhotoVideoId: newUuid() })],
      },
      {
        item: { name: JobName.AssetGenerateThumbnails, data: { id: 'asset-1', source: 'upload' } },
        jobs: [JobName.SmartSearch, JobName.AssetDetectFaces, JobName.Ocr, JobName.AssetEncodeVideo],
        stub: [AssetFactory.create({ id: 'asset-1', type: AssetType.Video })],
      },
      {
        item: { name: JobName.SmartSearch, data: { id: 'asset-1' } },
        jobs: [],
      },
      {
        item: { name: JobName.AssetDetectFaces, data: { id: 'asset-1' } },
        jobs: [],
      },
      {
        item: { name: JobName.FacialRecognition, data: { id: 'asset-1' } },
        jobs: [],
      },
    ];

    for (const { item, jobs, stub } of tests) {
      it(`should queue ${jobs.length} jobs when a ${item.name} job finishes successfully`, async () => {
        if (stub) {
          mocks.asset.getById.mockResolvedValue(stub[0]);
          mocks.asset.getByIdsWithAllRelationsButStacks.mockResolvedValue(stub);
        }

        mocks.job.run.mockResolvedValue(JobStatus.Success);

        await sut.onJobRun(QueueName.BackgroundTask, item);

        if (jobs.length > 1) {
          expect(mocks.job.queueAll).toHaveBeenCalledWith(
            jobs.map((jobName) => ({ name: jobName, data: expect.anything() })),
          );
        } else {
          expect(mocks.job.queue).toHaveBeenCalledTimes(jobs.length);
          for (const jobName of jobs) {
            expect(mocks.job.queue).toHaveBeenCalledWith({ name: jobName, data: expect.anything() });
          }
        }
      });

      it(`should not queue any jobs when ${item.name} fails`, async () => {
        mocks.job.run.mockResolvedValue(JobStatus.Failed);

        await sut.onJobRun(QueueName.BackgroundTask, item);

        expect(mocks.job.queueAll).not.toHaveBeenCalled();
      });
    }
  });
});
