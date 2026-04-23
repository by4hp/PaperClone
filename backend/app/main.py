import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .config import settings
from .services.cleanup import cleanup_loop, sweep_once

app = FastAPI(title="PaperClone API", version="0.1.0")

_origins = [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.on_event("startup")
async def _start_cleanup() -> None:
    sweep_once()
    asyncio.create_task(cleanup_loop())


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
