#!/usr/bin/env python3
"""content-platform 补充路由（从主仓库 main.py / collab_engine / prd_engine 移植）。

主仓库把这些接口直接挂在 main.py 或研发模块里，独立版 app_creation.py 未包含，
导致前端页面（个人中心/首页/通知/任务/评论/分享/用量）404。
本模块补齐这些「页面依赖但未挂载」的接口，仅保留内容创作平台需要的部分。
"""

import json
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from common.auth import require_auth  # noqa: E402
from common.db import get_db  # noqa: E402

router = APIRouter()


# ── 个人中心：修改密码 / 额度 / 用量 ─────────────────────────────


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.put("/api/auth/password")
async def change_pwd(req: ChangePasswordRequest, current_user: dict = require_auth()):
    """修改密码。"""
    from common.auth import change_password

    change_password(current_user.get("user_id"), req.old_password, req.new_password)
    return {"message": "密码已更新"}


@router.get("/api/auth/quota")
async def quota(current_user: dict = require_auth()):
    """当前额度信息。"""
    from common.auth import get_quota_info

    return get_quota_info(current_user.get("user_id"))


@router.get("/api/auth/usage/detail")
async def usage_detail(current_user: dict = require_auth()):
    """近 30 天按功能分组的用量明细。"""
    from common.auth import get_usage_detail

    return {"items": get_usage_detail(current_user.get("user_id"), days=30)}


@router.get("/api/auth/usage/timeline")
async def usage_timeline(current_user: dict = require_auth()):
    """每日用量趋势（用于折线图）。"""
    from common.auth import get_usage_daily_timeline

    return {"data": get_usage_daily_timeline(current_user.get("user_id"), days=30)}


# ── 页面可见性 / 门户 ────────────────────────────────────────────


@router.get("/api/access/pages")
async def access_pages(current_user: dict = require_auth()):
    """当前用户可见的页面列表（Sidebar / 路由守卫使用）。"""
    from permissions import PAGES, access_status, get_visibility_map, load_user_ctx

    vis_map = get_visibility_map("page")
    user_ctx = load_user_ctx(current_user)
    result = []
    for p in PAGES:
        status = access_status(user_ctx, vis_map.get(p["id"], "all"))
        if not status["visible"]:
            continue
        item = {**p}
        if status.get("locked"):
            item["locked"] = True
            item["requires"] = status["requires"]
        result.append(item)
    return result


@router.get("/api/portal/current")
async def get_current_portal(current_user: dict = require_auth()):
    """获取当前用户绑定的门户配置（导航树 + 高亮工具），用于前端渲染侧边栏。"""
    from portals import get_portal_nav_for_user, load_user_ctx

    user_ctx = load_user_ctx(current_user)
    return get_portal_nav_for_user(user_ctx)


@router.get("/api/portal/list")
async def list_portals():
    """列出所有可用门户（公开接口，前端切换器展示）。"""
    from portals import PORTAL_DEFS

    return {"portals": list(PORTAL_DEFS.values())}


class PortalSwitchRequest(BaseModel):
    portal_type: str


@router.post("/api/portal/switch")
async def switch_portal(req: PortalSwitchRequest, current_user: dict = require_auth()):
    """切换当前用户的门户类型。"""
    from portals import set_user_portal_type

    set_user_portal_type(current_user["user_id"], req.portal_type)
    return {"portal_type": req.portal_type, "message": "门户已切换"}


# ── 模型配置（ModelSwitcher：模型列表取自中转站/本地配置） ──────


class ConfigSaveRequest(BaseModel):
    model_name: str = ""


@router.get("/api/config")
async def get_config(current_user: dict = require_auth()):
    """当前模型配置（本地版：模型全部来自用户中转站，未配置 Key 时列表为空）。"""
    from common.auth import get_user_profile
    from common.config import get_model_list, get_model_config

    uid = current_user.get("user_id", "")
    profile = get_user_profile(uid)
    relay_configured = bool(profile.get("relay_configured"))
    models = get_model_list()  # [{name, note, base_url}] 来自用户中转站
    # 按功能模型偏好（用户自由切换，不写死）
    prefs = _load_model_prefs(uid)
    cfg = get_model_config(prefs.get("default") or None)
    return {
        "model_name": prefs.get("default") or (models[0]["name"] if models else ""),
        "models": models,
        "relay_configured": relay_configured,
        "register_url": "https://aixinghuo.net/",
        "image_model": prefs.get("image") or "",
        "video_model": prefs.get("video") or "",
        "audio_model": prefs.get("audio") or "",
        "default_model": prefs.get("default") or "",
    }


def _load_model_prefs(uid: str) -> dict:
    """读取用户按功能选择的模型偏好（config 表 model_prefs:{uid}）。"""
    try:
        from common.db import get_db_context

        with get_db_context() as conn:
            row = conn.execute(
                "SELECT value FROM config WHERE key=?", (f"model_prefs:{uid}",)
            ).fetchone()
        if row and row["value"]:
            data = json.loads(row["value"])
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


class ModelPrefsRequest(BaseModel):
    default: str = ""
    image: str = ""
    video: str = ""
    audio: str = ""


@router.get("/api/model-prefs")
async def get_model_prefs(current_user: dict = require_auth()):
    """读取用户按功能选择的模型偏好。"""
    return _load_model_prefs(current_user.get("user_id", ""))


@router.put("/api/model-prefs")
async def save_model_prefs(req: ModelPrefsRequest, current_user: dict = require_auth()):
    """保存用户按功能选择的模型偏好（图片/视频/音频/默认，自由切换）。"""
    uid = current_user.get("user_id", "")
    prefs = _load_model_prefs(uid)
    for k in ("default", "image", "video", "audio"):
        v = getattr(req, k, "")
        if v:
            prefs[k] = v
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (f"model_prefs:{uid}", json.dumps(prefs, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "prefs": prefs}


@router.post("/api/config/save")
async def save_config(req: ConfigSaveRequest, current_user: dict = require_auth()):
    """保存模型选择（写入 config 表，供后续请求默认使用）。"""
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO config (key, value) VALUES ('model_name',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (req.model_name,),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "model_name": req.model_name}


# ── 首页：案例墙 / 最新创作 ──────────────────────────────────────

# 工厂作品源 → 可读名称（与 gallery.SOURCE_LABEL 保持一致）
_FACTORY_SOURCE_LABEL = {
    "image_factory": "图片工厂",
    "video_factory": "视频工厂",
    "music_factory": "音乐工厂",
    "meme_factory": "表情包工坊",
    "game_factory": "小游戏工坊",
}

# 工厂类型 → 首页展示跳转路由（与前端菜单一致）
_FACTORY_ROUTE = {
    "image_factory": "/image-factory",
    "video_factory": "/video-factory",
    "music_factory": "/music-factory",
    "meme_factory": "/meme",
    "game_factory": "/games",
}

_DEMO_SHOWCASE = [
    {
        "share_code": "",
        "is_demo": True,
        "route": "/ppt-factory",
        "content_type": "PPT 演示",
        "title": "2026年智能家居行业趋势分析",
        "preview": "AI 原生、无感互联、绿色能源三大趋势拆解，含市场数据、竞争格局与战略建议。",
        "views": 0,
        "created_at": "",
    },
    {
        "share_code": "",
        "is_demo": True,
        "route": "/image-factory",
        "content_type": "AI 图片",
        "title": "高端香水商业摄影",
        "preview": "金色时刻布光 + 纯白背景，专业级产品摄影提示词生成效果。",
        "views": 0,
        "created_at": "",
    },
    {
        "share_code": "",
        "is_demo": True,
        "route": "/voice-dubbing",
        "content_type": "AI 配音",
        "title": "短视频口播配音（晓晓 · 1.0x）",
        "preview": "多音色场景化配音，支持语速/音调微调，一键导出 mp3。",
        "views": 0,
        "created_at": "",
    },
    {
        "share_code": "",
        "is_demo": True,
        "route": "/video-factory",
        "content_type": "AI 视频",
        "title": "文生视频：城市夜景延时",
        "preview": "提示词直接生成 5s 视频片段，支持分辨率/帧率/时长自定义。",
        "views": 0,
        "created_at": "",
    },
]


@router.get("/api/showcase")
async def showcase(limit: int = 12):
    """公开成果精选（首页案例墙，无需登录）。无真实分享时返回系统精选示例。"""
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT share_code, title, content_type, views, created_at,
                      substr(content, 1, 200) AS preview
               FROM shares
               WHERE content != '' AND length(content) >= 10 AND is_test = 0
               ORDER BY views DESC, created_at DESC
               LIMIT ?""",
            (min(limit, 30),),
        ).fetchall()
        items = []
        for r in rows:
            item = dict(r)
            item["preview"] = (item.get("preview") or "").replace("\n", " ").strip()[:120]
            items.append(item)
        if not items:
            items = _DEMO_SHOWCASE[: min(limit, len(_DEMO_SHOWCASE))]
        return {"items": items}
    finally:
        conn.close()


def _media_file_exists(media_url: str) -> bool:
    """按 media_url 前缀定位后端目录，校验媒体文件是否真实存在（过滤历史孤儿记录）。"""
    if not media_url:
        return False
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)))
    for prefix, sub in (
        ("/api/video-factory/videos/", "video_factory"),
        ("/api/image-factory/images/", "image_factory"),
        ("/api/meme-factory/images/", "meme_factory"),
    ):
        if media_url.startswith(prefix):
            return os.path.exists(os.path.join(base, sub, media_url[len(prefix):]))
    return True


@router.get("/api/factory/latest")
async def factory_latest(limit: int = 12):
    """最新创作墙：聚合各工厂最新生成的图片/视频作品，供首页真实作品展示。"""
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT id, type, author, media_url, thumbnail, duration, created_at, content
               FROM artifacts
               WHERE type IN ('image','video') AND active=1 AND media_url != ''
               ORDER BY created_at DESC LIMIT ?""",
            (min(limit, 30),),
        ).fetchall()
        items = []
        for r in rows:
            media_url = r["media_url"] or ""
            if not _media_file_exists(media_url):
                continue
            thumbnail = r["thumbnail"] or ""
            if not thumbnail and r["type"] == "video" and "/video-factory/videos/" in media_url:
                stem = media_url.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                if stem:
                    thumbnail = f"/api/video-factory/covers/{stem}.jpg"
            prompt = ""
            try:
                obj = json.loads(r["content"] or "{}")
                if isinstance(obj, dict):
                    prompt = (obj.get("prompt") or "")[:80]
            except Exception:
                prompt = (r["content"] or "")[:80]
            items.append(
                {
                    "id": r["id"],
                    "type": r["type"],
                    "author": _FACTORY_SOURCE_LABEL.get(r["author"], r["author"] or "平台用户"),
                    "media_url": media_url,
                    "thumbnail": thumbnail,
                    "duration": float(r["duration"] or 0),
                    "prompt": prompt,
                    "created_at": r["created_at"] or "",
                    "route": _FACTORY_ROUTE.get(r["author"], "/gallery"),
                }
            )
        return {"items": items}
    finally:
        conn.close()


# ── 分享 ────────────────────────────────────────────────────────


class ShareCreateRequest(BaseModel):
    content_type: str
    title: str
    content: str


@router.post("/api/shares")
async def create_share_api(req: ShareCreateRequest, current_user: dict = require_auth()):
    """创建分享，返回 share_code。"""
    from common.auth import create_share

    return create_share(current_user.get("user_id"), req.content_type, req.title, req.content)


@router.get("/api/shares/my")
async def my_shares(current_user: dict = require_auth()):
    """我的分享列表。"""
    from common.auth import get_my_share_stats

    return get_my_share_stats(current_user.get("user_id"))


# ── 作品广场评论 ────────────────────────────────────────────────


class CommentCreateRequest(BaseModel):
    content: str
    author_id: str
    parent_comment_id: str = ""
    target_type: str
    target_id: str


@router.get("/api/comments")
async def list_comments(target_type: str = None, target_id: str = None, user_id: str = ""):
    """获取评论列表（平铺 + 点赞统计）"""
    conn = get_db()
    try:
        if target_type and target_id:
            rows = conn.execute(
                "SELECT * FROM comments WHERE target_type=? AND target_id=? AND active=1 ORDER BY created_at DESC",
                (target_type, target_id),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM comments WHERE active=1 ORDER BY created_at DESC").fetchall()
        result = []
        for r in rows:
            c = dict(r)
            c["likes"] = conn.execute(
                "SELECT COUNT(*) c FROM comment_likes WHERE comment_id=?", (c["id"],)
            ).fetchone()["c"]
            c["liked"] = (
                bool(
                    conn.execute(
                        "SELECT 1 FROM comment_likes WHERE comment_id=? AND user_id=?", (c["id"], user_id)
                    ).fetchone()
                )
                if user_id
                else False
            )
            result.append(c)
        return result
    finally:
        conn.close()


@router.get("/api/comments/thread")
async def get_comment_thread(target_type: str, target_id: str, user_id: str = ""):
    """获取评论线程（含回复树 + 点赞统计）"""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM comments WHERE target_type=? AND target_id=? AND active=1 ORDER BY created_at ASC",
            (target_type, target_id),
        ).fetchall()
        comments = [dict(r) for r in rows]
        for c in comments:
            cnt = conn.execute(
                "SELECT COUNT(*) c FROM comment_likes WHERE comment_id=?", (c["id"],)
            ).fetchone()["c"]
            c["likes"] = cnt
            c["liked"] = (
                bool(
                    conn.execute(
                        "SELECT 1 FROM comment_likes WHERE comment_id=? AND user_id=?", (c["id"], user_id)
                    ).fetchone()
                )
                if user_id
                else False
            )
        by_id = {}
        roots = []
        for c in comments:
            c["replies"] = []
            by_id[c["id"]] = c
        for c in comments:
            parent = c.get("parent_comment_id")
            if parent and parent in by_id:
                by_id[parent]["replies"].append(c)
            else:
                roots.append(c)
        return roots
    finally:
        conn.close()


@router.post("/api/comments")
async def create_comment(req: CommentCreateRequest):
    """创建评论"""
    if not req.content:
        raise HTTPException(400, "评论内容不能为空")
    if not req.target_type or not req.target_id:
        raise HTTPException(400, "target_type 和 target_id 不能为空")
    comment_id = f"cmt_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO comments (id, content, author_id, parent_comment_id, target_type, target_id, created_at, updated_at, active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (comment_id, req.content, req.author_id, req.parent_comment_id, req.target_type, req.target_id, now, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": comment_id, "created_at": now}


@router.delete("/api/comments/{comment_id}")
async def delete_comment(comment_id: str):
    """删除评论"""
    conn = get_db()
    try:
        conn.execute("UPDATE comments SET active=0 WHERE id=?", (comment_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/api/comments/{comment_id}/like")
async def like_comment(comment_id: str, user_id: str = ""):
    """点赞/取消点赞评论"""
    conn = get_db()
    try:
        if not user_id:
            raise HTTPException(401, "请先登录")
        exists = conn.execute(
            "SELECT 1 FROM comment_likes WHERE comment_id=? AND user_id=?", (comment_id, user_id)
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM comment_likes WHERE comment_id=? AND user_id=?", (comment_id, user_id))
            liked = False
        else:
            conn.execute(
                "INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?,?,?)",
                (comment_id, user_id, datetime.now().isoformat()),
            )
            liked = True
        conn.commit()
        count = conn.execute(
            "SELECT COUNT(*) c FROM comment_likes WHERE comment_id=?", (comment_id,)
        ).fetchone()["c"]
        return {"liked": liked, "likes": count}
    finally:
        conn.close()


# ── 用量统计（DashboardPage） ───────────────────────────────────


@router.get("/api/usage-stats")
async def usage_stats(request: Request, days: int = 7, module: str = "", user: str = ""):
    """使用统计：趋势区间 + 按模块/用户筛选。"""
    from common.auth import decode_access_token, get_user_profile

    member_level, remaining_today = "free", None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = decode_access_token(auth_header[7:])
            uid = payload.get("user_id")
            if uid:
                profile = get_user_profile(uid)
                member_level = profile.get("membership", "free")
                remaining_today = profile.get("remaining_today")
        except Exception:
            pass
    days = min(max(int(days), 1), 90)
    module = (module or "").strip()
    user = (user or "").strip()
    where, params = "", []
    if module:
        where += " AND task_type=?"
        params.append(module)
    if user:
        where += " AND user_id=?"
        params.append(user)
    conn = get_db()
    try:
        total = conn.execute(f"SELECT COUNT(*) c FROM usage_logs WHERE 1=1{where}", params).fetchone()["c"]
        success = conn.execute(
            f"SELECT COUNT(*) c FROM usage_logs WHERE 1=1{where} AND success=1", params
        ).fetchone()["c"]
        avg_time = conn.execute(
            f"SELECT AVG(response_time) a FROM usage_logs WHERE 1=1{where}", params
        ).fetchone()["a"]
        by_type = conn.execute(
            f"SELECT task_type, COUNT(*) c, AVG(response_time) a FROM usage_logs WHERE 1=1{where} GROUP BY task_type",
            params,
        ).fetchall()
        recent = conn.execute(
            f"SELECT * FROM usage_logs WHERE 1=1{where} ORDER BY timestamp DESC LIMIT 10", params
        ).fetchall()
        daily = conn.execute(
            f"SELECT substr(timestamp,1,10) d, COUNT(*) c, SUM(input_length + output_length) tokens "
            f"FROM usage_logs WHERE timestamp >= datetime('now', ?) AND 1=1{where} GROUP BY d ORDER BY d",
            [f"-{days} days"] + params,
        ).fetchall()
        dist_where, dist_params = "", []
        if user:
            dist_where += " AND user_id=?"
            dist_params.append(user)
        module_agg = conn.execute(
            f"SELECT task_type module, COUNT(*) c FROM usage_logs WHERE 1=1{dist_where} GROUP BY task_type ORDER BY c DESC",
            dist_params,
        ).fetchall()
        today = conn.execute(
            f"SELECT COUNT(*) c, COALESCE(SUM(input_length + output_length), 0) tokens FROM usage_logs "
            f"WHERE substr(timestamp,1,10) = substr(date('now'),1,10) AND 1=1{where}",
            params,
        ).fetchone()
        return {
            "member_level": member_level,
            "remaining_today": remaining_today,
            "total": total,
            "success": success,
            "avg_time": round(avg_time or 0, 1),
            "by_type": [dict(r) for r in by_type],
            "recent": [dict(r) for r in recent],
            "daily": [dict(r) for r in daily],
            "module_distribution": [dict(r) for r in module_agg],
            "today": {"count": today["c"], "tokens": today["tokens"]},
        }
    finally:
        conn.close()
