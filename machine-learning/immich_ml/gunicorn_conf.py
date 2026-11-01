import os
import sys

from gunicorn.arbiter import Arbiter
from gunicorn.workers.base import Worker
from uvicorn.workers import UvicornWorker

from immich_ml.config import LOG_CONFIG, CustomUvicornServer

device_ids = os.environ.get("MACHINE_LEARNING_DEVICE_IDS", "0").replace(" ", "").split(",")
env = os.environ

logconfig_dict = LOG_CONFIG


# Round-robin device assignment for each worker
def pre_fork(arbiter: Arbiter, _: Worker) -> None:
    env["MACHINE_LEARNING_DEVICE_ID"] = device_ids[len(arbiter.WORKERS) % len(device_ids)]


class CustomUvicornWorker(UvicornWorker):
    async def _serve(self) -> None:
        self.config.app = self.wsgi
        server = CustomUvicornServer(config=self.config)
        self._install_sigquit_handler()
        await server.serve(sockets=self.sockets)
        if not server.started:
            sys.exit(Arbiter.WORKER_BOOT_ERROR)
