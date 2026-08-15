#!/usr/bin/env python3
"""内容创作独立版入口（模式 B：用户自带中转站 Key）。

只包含内容创作 + 工具相关路由（不含代码/Agent/PRD），
所有 AI 调用走用户中转站 Key（URL 平台写死），平台卖 token 盈利。

启动：python app_creation.py（默认 8888，PORT 环境变量可覆盖）
"""

import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BASE_DIR / ".env")

import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from common.auth import (  # noqa: E402
    decode_access_token,
    get_current_user,
    get_user_profile,
    get_user_relay_config,
    require_auth,
)
from common.config import ALLOWED_ORIGINS  # noqa: E402
from common.db import get_db, init_schema  # noqa: E402
from common.observability import RequestContextMiddleware  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动初始化：建表 + 用户中转站字段迁移。"""
    init_schema()
    # 模式 B：users 表补 relay 字段
    try:
        conn = get_db()
        try:
            conn.execute("ALTER TABLE users ADD COLUMN relay_api_key TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN relay_api_base TEXT DEFAULT ''")
        except Exception:
            pass
        conn.commit()
        conn.close()
    except Exception:
        pass
    # 建 async_tasks 表（任务队列依赖）
    try:
        from task_queue import _ensure_table as _ensure_task_table

        conn = get_db()
        _ensure_task_table(conn)
        conn.commit()
        conn.close()
    except Exception:
        pass
    # 数字人记录表（digital_human._ensure_tables）
    try:
        from digital_human import _ensure_tables as _ensure_dh_tables

        conn = get_db()
        _ensure_dh_tables(conn)
        conn.close()
    except Exception:
        pass
    from task_queue import start_workers  # noqa: E402
    start_workers()
    yield
    from task_queue import stop_workers  # noqa: E402
    stop_workers()


app = FastAPI(title="小团智能 · 内容创作平台", version="1.0.0", lifespan=lifespan)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "db": "ok",
        "mode": "content-creation",
    }


from fastapi import HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402


class AuthRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
async def login(req: AuthRequest):
    """登录（无邀请码简版：独立版用户直接注册后登录）。"""
    from common.auth import login_user

    try:
        return login_user(req.username, req.password)
    except Exception as e:
        raise HTTPException(401, "用户名或密码错误") from e


@app.post("/api/auth/register")
async def register(req: AuthRequest):
    """注册（独立版：新用户自动获得中转站配置能力）。"""
    from common.auth import register_user

    try:
        return register_user(req.username, req.password)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/auth/me")
async def me(current_user: dict = require_auth()):
    profile = get_user_profile(current_user.get("user_id", ""))
    return profile


# ── 创作模块路由 ──────────────────────────────────────────
from image_factory import router as image_factory_router  # noqa: E402
from video_factory import router as video_factory_router  # noqa: E402
from music_factory import router as music_factory_router  # noqa: E402
from voice_factory import router as voice_factory_router  # noqa: E402
from meme_factory import router as meme_factory_router  # noqa: E402
from game_factory import router as game_factory_router  # noqa: E402
from miniapp import router as miniapp_router  # noqa: E402
from short_drama import router as drama_router  # noqa: E402
from digital_human import router as digital_human_router  # noqa: E402
from relay_api import router as relay_router  # noqa: E402
from drafts import router as drafts_router  # noqa: E402
from gallery import router as gallery_router  # noqa: E402

for r in [
    image_factory_router, video_factory_router, music_factory_router,
    voice_factory_router, meme_factory_router, game_factory_router,
    miniapp_router, drama_router, digital_human_router,
    relay_router, drafts_router, gallery_router,
]:
    app.include_router(r)

# 静态上传目录（如有）
for d in ("uploads", "image_factory", "video_factory", "music_factory", "meme_factory"):
    p = BASE_DIR / d
    if p.is_dir():
        try:
            app.mount(f"/{d}", StaticFiles(directory=str(p)), name=d)
        except Exception:
            pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8888"))
    uvicorn.run(app, host="0.0.0.0", port=port)
