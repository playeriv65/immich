import { ConflictException } from '@nestjs/common';
import { Response } from 'express';
import { vitest } from 'vitest';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { sendFile } from 'src/utils/file.js';
import { automock } from 'test/utils.js';

describe('sendFile', () => {
  it('preserves the expected offline response without logging a server error', async () => {
    const response = { sendFile: vitest.fn() } as unknown as Response;
    const logger = automock(LoggingRepository, { strict: false });
    const next = vitest.fn();
    const error = new ConflictException('Original storage is offline');

    await sendFile(response, next, () => Promise.reject(error), logger);

    expect(next).toHaveBeenCalledWith(error);
    expect(logger.error).not.toHaveBeenCalled();
    expect(response.sendFile).not.toHaveBeenCalled();
  });
});
