# Windows DirectML machine learning

This fork can run the machine-learning service natively on Windows through ONNX Runtime DirectML. Immich Server, PostgreSQL and Redis continue to use the existing Docker deployment. Keep the machine-learning source at the same revision as the server.

## Setup

1. Install the supported AMD, Intel or NVIDIA Windows graphics driver. DirectML uses a DirectX 12 device.
2. In `machine-learning`, run `uv sync --extra directml --python 3.12`. Do not install another ONNX Runtime distribution into this environment.
3. Set `IMMICH_HOST=127.0.0.1`, `IMMICH_PORT=3003`, and `MACHINE_LEARNING_CACHE_FOLDER` to an internal-disk directory. Set `MACHINE_LEARNING_DEVICE_ID` to the DXGI adapter index.
4. For a persistent native service, set `MACHINE_LEARNING_MODEL_TTL_POLL_S=0`; Gunicorn's idle-worker restart is unavailable on Windows. Model cache entries still expire according to `MACHINE_LEARNING_MODEL_TTL`.
5. Start `uv run --extra directml python -m immich_ml`.
6. Configure the Docker-hosted server's machine-learning URL as `http://host.docker.internal:3003`. Verify that the container can reach `/ping` before importing a library. Keep this unauthenticated service restricted to the local machine.

For the DirectML deployment, set `MACHINE_LEARNING_MODEL_TTL=0` to retain GPU sessions. On the tested Radeon 780M, timed model eviction and recreation caused native access violations during subsequent multi-model inference. Merely upgrading ONNX Runtime did not resolve that reproduction. Keeping sessions resident avoids this lifecycle and requires enough RAM for the active models. Validate a batch covering detection, recognition, image search and OCR, including repeated idle/reload cycles before enabling automatic unloading.

Use `MACHINE_LEARNING_MODEL_REVISION=v2` for the current models and GPU FP16 preparation. Start with one request thread and one job per machine-learning queue, particularly on integrated GPUs that share system memory. A multilingual search model also needs memory for its text encoder when a search runs.

DirectML sessions disable memory-pattern optimization, use sequential execution and serialize calls to each session. CPU fallback remains available for operators unsupported by DirectML. Verify GPU execution with an ONNX Runtime profile; merely listing an installed provider does not establish that a graph used it.

## Validation

Run formatting, lint, type checks and tests through the existing mise tasks. `TestOrtSessions` covers DirectML's required session settings. Full unit tests also exercise graph preparation, file locking and allocator cleanup. Device validation should additionally execute a small graph with CPU fallback disabled, then test image search, text search, face detection and OCR through `/predict`.

The Windows launcher uses Uvicorn. Linux deployments retain Gunicorn and its existing worker configuration.

ONNX Attention is decomposed using the existing model rewrite before DirectML session creation. Unsupported fused Attention otherwise falls back to CPU and can dominate inference despite DirectML appearing first in the provider list. The rewrite participates in the artifact fingerprint, so cached graphs are regenerated when the plan changes. Validate actual operator placement with ONNX Runtime profiling and compare feature vectors after changing graph preparation.
