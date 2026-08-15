#!/usr/bin/env python3
"""content-platform 定制补丁（sync 后自动重新应用）。

主仓库模块迭代会覆盖 content-platform 的特有适配（prd_engine 兜底等），
本文件在同步后重新注入，保证「主仓库更新 → 同步 → 定制不丢」。
"""

import os

CP_BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')


def _patch_extended_api() -> int:
    """extended_api：prd_engine 兜底（独立版无 prd_engine）。"""
    path = os.path.join(CP_BACKEND, 'extended_api.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    marker = 'from prd_engine import stream_llm_response'
    if marker not in src:
        return 0
    # 已打过补丁则跳过
    if 'try:' in src.split('def stream_llm_response')[0] and 'except ImportError' in src:
        return 0
    fallback = (
        'try:\n'
        '    from prd_engine import stream_llm_response  # 完整版\n'
        'except ImportError:\n'
        '    # 独立版兜底：简单 SSE 流式\n'
        '    import json as _json\n'
        '\n'
        '    def stream_llm_response(system_prompt, user_prompt, max_tokens, usage_key):\n'
        '        from common.llm import call_llm_async\n'
        '        from fastapi.responses import StreamingResponse\n'
        '\n'
        '        async def _gen():\n'
        '            try:\n'
        '                full = await call_llm_async(system_prompt, user_prompt, max_tokens=max_tokens)\n'
        '                yield "data: " + _json.dumps({"delta": full}) + "\\n\\n"\n'
        '                yield "data: " + _json.dumps({"done": True, "full": full}) + "\\n\\n"\n'
        '            except Exception as e:\n'
        '                yield "data: " + _json.dumps({"error": str(e)}) + "\\n\\n"\n'
        '\n'
        '        return StreamingResponse(_gen(), media_type="text/event-stream")\n'
    )
    src = src.replace(marker, fallback, 1)
    open(path, 'w', encoding='utf-8').write(src)
    return 1


def _patch_relay_api() -> int:
    """relay_api：import-models 的 prd_engine 兜底。"""
    path = os.path.join(CP_BACKEND, 'relay_api.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    marker = '    from prd_engine import _get_models, _save_models'
    if marker not in src:
        return 0
    if 'except ImportError' in src:
        return 0
    fallback = (
        '    try:\n'
        '        from prd_engine import _get_models, _save_models\n'
        '    except ImportError:\n'
        '        from common.config import get_model_list\n'
        '\n'
        '        def _get_models():\n'
        '            return get_model_list()\n'
        '\n'
        '        def _save_models(models):\n'
        '            with get_db_context() as conn:\n'
        '                import json as _json\n'
        '                conn.execute(\n'
        '                    "INSERT INTO config (key, value) VALUES (\'model_list\',?) "\n'
        '                    "ON CONFLICT(key) DO UPDATE SET value=?",\n'
        '                    (_json.dumps(models, ensure_ascii=False), _json.dumps(models, ensure_ascii=False)),\n'
        '                )\n'
    )
    src = src.replace(marker, fallback, 1)
    open(path, 'w', encoding='utf-8').write(src)
    return 1


def _patch_digital_human() -> int:
    """digital_human：本地版水印策略 + 无会员 402 文案（主仓库商业版会覆盖）。"""
    path = os.path.join(CP_BACKEND, 'digital_human.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 水印：主仓库按会员等级强制，本地版改为用户开关自由控制
    old_wm = 'use_watermark = (membership == "free" and role != "admin") or bool(req.watermark)'
    new_wm = 'use_watermark = bool(req.watermark)  # 本地免费版：水印由用户开关自由控制'
    if old_wm in src:
        src = src.replace(old_wm, new_wm, 1)
        n += 1
    # 水印品牌（本地版品牌为 AI 星火，防 sync 恢复旧品牌）
    if 'WATERMARK_TEXT = "AI 数字人 · 小团智能"' in src:
        src = src.replace('WATERMARK_TEXT = "AI 数字人 · 小团智能"', 'WATERMARK_TEXT = "AI 星火 · 数字人"', 1)
        n += 1
    # 402 文案：去掉「升级会员」引导
    for old_msg, new_msg in [
        (
            '"今日数字人生成次数已用完，升级会员获取更多额度（专业版每日 200 次，至尊版不限量）"',
            '"今日数字人生成次数已用完，可在次日 0 点自动恢复"',
        ),
        ('"今日生成次数已用完，升级会员获取更多额度"', '"今日生成次数已用完，可在次日 0 点自动恢复"'),
    ]:
        if old_msg in src:
            src = src.replace(old_msg, new_msg, 1)
            n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(src)
    return n


def _patch_task_queue() -> int:
    """task_queue：402 文案去掉「升级会员」引导。"""
    path = os.path.join(CP_BACKEND, 'task_queue.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    old = 'raise HTTPException(402, "今日免费额度已用完，升级会员可继续使用（剩余 0 次）")'
    new = 'raise HTTPException(402, "今日免费额度已用完，可在次日 0 点自动恢复（剩余 0 次）")'
    if old not in src:
        return 0
    open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
    return 1


def _patch_short_drama() -> int:
    """short_drama：402 文案去掉「升级会员」引导。"""
    path = os.path.join(CP_BACKEND, 'short_drama.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    old = '"今日短剧生成次数已用完，升级会员获取更多额度（专业版每日 200 次，至尊版不限量）"'
    new = '"今日短剧生成次数已用完，可在次日 0 点自动恢复"'
    if old not in src:
        return 0
    open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
    return 1


def _patch_stock_reports_order() -> int:
    """stock_tools：/api/stock/reports 路由必须先于 /api/stock/{symbol} 注册，
    否则被 {symbol} 通配遮蔽（主仓库同款 bug，同步后会复发，此处重新调整）。"""
    path = os.path.join(CP_BACKEND, 'stock_tools.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    sym = '@router.get("/api/stock/{symbol}")'
    rep = '@router.get("/api/stock/reports")'
    if rep not in src or sym not in src:
        return 0
    if src.index(rep) < src.index(sym):
        return 0  # 顺序已正确
    marker = '\n\n@router.get("/api/stock/reports")'
    start = src.index(marker)
    end_marker = '    return {"ok": True}\n\n\n'
    end = src.index(end_marker) + len(end_marker)
    block = src[start:end]
    rest = src[:start] + src[end:]
    ins = '\n\n@router.get("/api/stock/{symbol}")'
    i = rest.index(ins)
    rest = rest[:i] + block + rest[i:]
    open(path, 'w', encoding='utf-8').write(rest)
    return 1


def _patch_image_factory_render() -> int:
    """image_factory：校验 render_template_image 主体完整（_render_once）。

    历史 bug：重构拆分图层函数时误删主函数体 + 底部残留旧版重复函数，
    导致 render_template_image 恒返回 None、视频模板预览/封面 500。
    若主仓库同步回的版本再次出现此问题，此处自动修复。
    """
    path = os.path.join(CP_BACKEND, 'image_factory.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 1. 主函数体缺失 → 补回 _render_once + 渲染/返回逻辑
    if 'async def _render_once(batch_url: str)' not in src:
        old = (
            '    async def _make_bg() -> Image.Image:\n'
            '        """背景：背景图（cover 铺满 + 模糊 + 暗化）> 渐变简写 > 纯色。"""\n'
            '        return await _make_template_bg(template, overrides, width, height)\n'
            '\n'
            'def _render_rect_layer(canvas, draw, layer, overrides) -> None:'
        )
        new = (
            '    async def _make_bg() -> Image.Image:\n'
            '        """背景：背景图（cover 铺满 + 模糊 + 暗化）> 渐变简写 > 纯色。"""\n'
            '        return await _make_template_bg(template, overrides, width, height)\n'
            '\n'
            '    async def _render_once(batch_url: str) -> Image.Image:\n'
            '        """按模板渲染一张（batch_url 为批量模式下该轮主槽图片，单张模式传空）。"""\n'
            '        canvas = await _make_bg()\n'
            '        draw = ImageDraw.Draw(canvas)\n'
            '        for layer in template.get("layers", []):\n'
            '            await _render_layer(canvas, draw, layer, overrides, batch_url, slot_map, main_slot_key)\n'
            '            draw = ImageDraw.Draw(canvas)\n'
            '        return canvas\n'
            '\n'
            '    _report(15, "正在渲染模板…")\n'
            '    if batch_urls:\n'
            '        total = len(batch_urls)\n'
            '        results = []\n'
            '        for i, u in enumerate(batch_urls):\n'
            '            _report(15 + int(i * 75 / total), f"正在处理第 {i + 1}/{total} 张…")\n'
            '            results.append(await _render_once(u))\n'
            '        _report(100, "模板渲染完成")\n'
            '        return results\n'
            '    result = [await _render_once("")]\n'
            '    _report(100, "模板渲染完成")\n'
            '    return result\n'
            '\n'
            'def _render_rect_layer(canvas, draw, layer, overrides) -> None:'
        )
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 2. 底部旧版重复函数 → 删除（防止遮蔽新版签名）
    marker = '\n\ndef _render_rect_layer(layer: dict, canvas, draw, width: int, height: int) -> None:'
    if marker in src:
        src = src[:src.index(marker)].rstrip() + '\n'
        n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(src)
    return n


def _patch_config_relay_models() -> int:
    """common/config：本地版模型不写死（DEFAULT_MODELS 置空），全部来自用户中转站。"""
    path = os.path.join(CP_BACKEND, 'common', 'config.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    marker = 'DEFAULT_MODELS = []'
    if marker in src:
        return 0
    # 找到 DEFAULT_MODELS = [ ... ] 整块并清空
    import re
    m = re.search(r'DEFAULT_MODELS\s*=\s*\[[^\]]*\]', src, re.S)
    if not m:
        return 0
    src = src[:m.start()] + 'DEFAULT_MODELS = []  # 本地版：模型不写死，来自用户中转站' + src[m.end():]
    # 各功能默认模型也置空（不写死 agnes 模型）
    for d in ('MODEL_NAME', 'IMAGE_MODEL', 'VIDEO_MODEL'):
        src = re.sub(
            d + r' = os\.environ\.get\("' + d + r'", "[^"]*"\)',
            d + ' = os.environ.get("' + d + '", "")',
            src,
        )
    # get_model_config：空模型名 → 取中转站模型列表第一个；无列表则明确报错
    if '自动取用户中转站模型列表第一个' not in src:
        anchor = '''    user_key = (user_relay or {}).get("api_key") or ""

    for m in get_model_list():'''
        inject = '''    user_key = (user_relay or {}).get("api_key") or ""

    # 未指定模型名（文案/工具等 LLM 功能前端不传 model）：
    # 自动取用户中转站模型列表第一个；无列表则明确报错（本地版不写死任何模型）
    if not name:
        _models = get_model_list()
        if _models:
            name = (_models[0].get("name") or "").strip()
        if not name:
            from fastapi import HTTPException

            raise HTTPException(
                400,
                "未选择模型：请先在个人中心配置中转站 Key（模型将从中转站拉取），或先选择一个模型",
            )

    for m in get_model_list():'''
        if anchor in src:
            src = src.replace(anchor, inject, 1)
    # get_model_config 空模型名：优先用户默认模型偏好，其次列表第一个
    if '用户选择的「默认模型」' not in src:
        old_t = '''        _models = get_model_list()
        if _models:
            name = (_models[0].get("name") or "").strip()
        if not name:'''
        new_t = '''        name = ((user_relay or {}).get("default_model") or "").strip()
        if not name:
            _models = get_model_list()
            if _models:
                name = (_models[0].get("name") or "").strip()
        if not name:'''
        if old_t in src:
            src = src.replace(old_t, new_t, 1)
            n += 1
    # require_model 助手（工厂在未选择模型时给出清晰报错）
    if 'def require_model(' not in src:
        helper = '''

def require_model(model_name: str, feature_label: str) -> str:
    """校验并返回生效模型；为空时抛出清晰错误（本地版不写死任何模型）。"""
    from fastapi import HTTPException

    model_name = (model_name or "").strip()
    if not model_name:
        raise HTTPException(
            400,
            f"未选择{feature_label}模型：请先在个人中心配置中转站 Key，并在页面选择模型",
        )
    return model_name
'''
        src = src.rstrip() + helper
    open(path, 'w', encoding='utf-8').write(src)
    return 1


def _patch_config_relay_base() -> int:
    """common/config：中转站地址固定为爱星火 aixinghuo.net/v1（防绕开计费）。"""
    path = os.path.join(CP_BACKEND, 'common', 'config.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    if 'https://aixinghuo.net/v1' not in src:
        old = 'os.environ.get("AGNES_API_BASE", "https://apihub.agnes-ai.com/v1")'
        if old in src:
            src = src.replace(old, 'os.environ.get("AGNES_API_BASE", "https://aixinghuo.net/v1")', 1)
            open(path, 'w', encoding='utf-8').write(src)
            return 1
    return 0


def _patch_auth_relay_quota() -> int:
    """common/auth：本地免费版彻底取消次数限制（有中转站 token 即可随意使用）。"""
    path = os.path.join(CP_BACKEND, 'common', 'auth.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 1. consume_quota：函数入口直接放行
    if '有中转站 token 即可随意使用' not in src:
        old = 'def consume_quota(user_id: str) -> dict:'
        new = ('def consume_quota(user_id: str) -> dict:\n'
               '    """本地免费版：无次数限制，用户有中转站 token 即可随意使用，计费在中转站。"""\n'
               '    return {"allowed": True, "remaining": 9999, "charged": False}')
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 2. get_quota_info：入口直接返回不限
    if '"relay_billed": True' not in src:
        old = 'def get_quota_info(user_id: str) -> dict:'
        new = ('def get_quota_info(user_id: str) -> dict:\n'
               '    """本地免费版：无次数限制，返回固定不限额度。"""\n'
               '    _profile = get_user_profile(user_id)\n'
               '    return {\n'
               '        "membership": "free", "membership_expires": None, "membership_days_left": None,\n'
               '        "username": _profile.get("username", ""), "role": _profile.get("role", ""),\n'
               '        "daily_quota": None, "bonus_quota": 0, "used_today": 0,\n'
               '        "remaining_today": 9999, "total_usage": _profile.get("total_usage", 0),\n'
               '        "relay_billed": True,\n'
               '    }')
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 3. get_user_profile 返回 relay_configured（前端判断用）
    if '"relay_configured": bool(row.get("relay_api_key"))' not in src:
        old = '        "created_at": row.get("created_at"),\n    }'
        new = '        "created_at": row.get("created_at"),\n        "relay_configured": bool(row.get("relay_api_key")),\n    }'
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 4. get_current_user 注入 default_model（全局模型切换生效的关键）
    if 'relay["default_model"] = resolve_feature_model' not in src:
        old_t = '''            from common.relay_context import set_relay_context

            set_relay_context(relay)'''
        new_t = '''            # 同时携带用户选择的「默认模型」（侧边栏全局模型切换）
            try:
                from common.config import resolve_feature_model

                relay["default_model"] = resolve_feature_model(user_id, "default", "")
            except Exception:
                pass
            from common.relay_context import set_relay_context

            set_relay_context(relay)'''
        if old_t in src:
            src = src.replace(old_t, new_t, 1)
            n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(src)
    return n



def _patch_voice_dh_models() -> int:
    """音频/数字人模型接线：配音用 audio 偏好、数字人文案用 dh 偏好；config 提供 resolve_feature_model。"""
    n = 0
    # 1. common/config.py resolve_feature_model 助手
    p = os.path.join(CP_BACKEND, 'common', 'config.py')
    if os.path.exists(p):
        s = open(p, encoding='utf-8').read()
        if 'def resolve_feature_model(' not in s:
            helper = '\n\ndef resolve_feature_model(uid: str, feature: str, fallback: str = "") -> str:\n'
            helper += '    """读取用户按功能选择的模型偏好（model_prefs:{uid} {feature}），未选择用 fallback。"""\n'
            helper += '    if not uid:\n        return fallback\n'
            helper += '    try:\n        from common.db import get_db_context\n\n'
            helper += '        with get_db_context() as conn:\n'
            helper += '            row = conn.execute("SELECT value FROM config WHERE key=?", (f"model_prefs:{uid}",)).fetchone()\n'
            helper += '        if row and row["value"]:\n'
            helper += '            prefs = json.loads(row["value"])\n'
            helper += '            m = (prefs.get(feature) or "").strip()\n'
            helper += '            if m:\n                return m\n'
            helper += '    except Exception:\n        pass\n'
            helper += '    return fallback\n'
            s = s.rstrip() + helper
            open(p, 'w', encoding='utf-8').write(s)
            n += 1
    # 2. voice_factory：TTS 用 audio 偏好
    p = os.path.join(CP_BACKEND, 'voice_factory.py')
    if os.path.exists(p):
        s = open(p, encoding='utf-8').read()
        if '"audio_model": _resolve_audio_model' not in s:
            if '"user_id": uid,' not in s:
                old_t = '        "template_id": template_id,\n        "project_id": project_id,\n    }'
                new_t = '        "template_id": template_id,\n        "project_id": project_id,\n        "user_id": uid,\n    }'
                if old_t in s:
                    s = s.replace(old_t, new_t, 1)
                    n += 1
            if 'def _resolve_audio_model(' not in s:
                old_t = 'def _resolve_voice_params(payload: dict) -> dict:'
                new_t = ('def _resolve_audio_model(uid: str) -> str:\n'
                         '    """读取用户选择的音频(TTS)模型（model_prefs:{uid} audio），未选择用标准 tts-1。"""\n'
                         '    if not uid:\n        return "tts-1"\n'
                         '    try:\n        from common.db import get_db_context\n\n'
                         '        with get_db_context() as conn:\n'
                         '            row = conn.execute("SELECT value FROM config WHERE key=?", (f"model_prefs:{uid}",)).fetchone()\n'
                         '        if row and row["value"]:\n'
                         '            prefs = json.loads(row["value"])\n'
                         '            m = (prefs.get("audio") or "").strip()\n'
                         '            if m:\n                return m\n'
                         '    except Exception:\n        pass\n'
                         '    return "tts-1"\n\n\n'
                         'def _resolve_voice_params(payload: dict) -> dict:')
                if old_t in s:
                    s = s.replace(old_t, new_t, 1)
                    n += 1
            if '"audio_model": _resolve_audio_model(payload.get("user_id", ""))' not in s:
                old_t = '        "format": fmt, "emotion": emotion, "tts_voice": tts_voice, "tts_speed": tts_speed,\n    }'
                new_t = '        "format": fmt, "emotion": emotion, "tts_voice": tts_voice, "tts_speed": tts_speed,\n        "audio_model": _resolve_audio_model(payload.get("user_id", "")),\n    }'
                if old_t in s:
                    s = s.replace(old_t, new_t, 1)
                    n += 1
            if 'params.get("audio_model", "tts-1")' not in s:
                old_t = 'data = await asyncio.to_thread(_tts_one, seg, tts_voice, tts_speed, pitch, emotion)'
                new_t = 'data = await asyncio.to_thread(_tts_one, seg, tts_voice, tts_speed, pitch, emotion, params.get("audio_model", "tts-1"))'
                if old_t in s:
                    s = s.replace(old_t, new_t, 1)
                    n += 1
            if 'json={"model": model, "input": text, "voice": voice, "speed": speed}' not in s:
                old_t = 'json={"model": "tts-1", "input": text, "voice": voice, "speed": speed},'
                new_t = 'json={"model": model, "input": text, "voice": voice, "speed": speed},'
                if old_t in s:
                    s = s.replace(old_t, new_t, 1)
                    n += 1
            if 'model: str = "tts-1"' not in s:
                old_t = 'def _tts_one(text: str, voice: str, speed: float, pitch: int = 0, emotion: str = "")'
                new_t = 'def _tts_one(text: str, voice: str, speed: float, pitch: int = 0, emotion: str = "", model: str = "tts-1")'
                if old_t in s:
                    s = s.replace(old_t, new_t, 1)
                    n += 1
            open(p, 'w', encoding='utf-8').write(s)
    # 3. digital_human：文案生成用 dh 偏好
    p = os.path.join(CP_BACKEND, 'digital_human.py')
    if os.path.exists(p):
        s = open(p, encoding='utf-8').read()
        if 'resolve_feature_model(_uid, "dh", "")' not in s:
            old_t = '        raw = call_llm(system, user_prompt, max_tokens=1500, temperature=0.9, timeout=60)'
            new_t = ('        from common.config import resolve_feature_model\n\n'
                     '        _uid = current_user.get("user_id", "") if isinstance(current_user, dict) else ""\n'
                     '        raw = call_llm(\n'
                     '            system, user_prompt, max_tokens=1500, temperature=0.9, timeout=60,\n'
                     '            model=resolve_feature_model(_uid, "dh", ""),\n'
                     '        )')
            if old_t in s:
                s = s.replace(old_t, new_t, 1)
                open(p, 'w', encoding='utf-8').write(s)
                n += 1
    return n


def _patch_video_templates_free() -> int:
    """video_templates：本地版无计费——模板全部免费（去计价/校验放行/购买放行）。"""
    path = os.path.join(CP_BACKEND, 'video_templates.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 1. 列表去计价
    if '"pricing": {"mode": "free"}' not in src:
        old_t = '''            "pricing": pricing,
            "pricing_label": {"free": "免费", "once": "按次", "day": "按天", "month": "按月"}.get(mode, "免费"),'''
        new_t = '''            "pricing": {"mode": "free"},  # 本地版无计费：全部模板免费
            "pricing_label": "免费",'''
        if old_t in src:
            src = src.replace(old_t, new_t, 1)
            n += 1
    # 2. 渲染校验放行
    if '模板渲染校验（本地免费版：无计费，一律放行）' not in src:
        old_t = '''    pricing = template.get("pricing") or {}
    if pricing.get("mode", "free") == "free":
        return
    if not user:
        raise HTTPException(402, "该模板为付费模板，请先登录后购买")'''
        new_t = '''    return  # 本地版不收费，所有模板可直接渲染'''
        if old_t in src:
            src = src.replace(old_t, new_t, 1)
            n += 1
    # 3. 购买放行
    if '本地版全部模板免费' not in src:
        old_t = '''    pricing = t.get("pricing") or {}
    if pricing.get("mode", "free") == "free":
        return {"ok": True, "message": "免费模板无需购买", "mode": "free"}'''
        new_t = '''    # 本地免费版：所有模板免费，无需购买/积分
    return {"ok": True, "message": "本地版全部模板免费，可直接使用", "mode": "free"}'''
        if old_t in src:
            src = src.replace(old_t, new_t, 1)
            n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(src)
    return n


def _patch_template_store_free() -> int:
    """template_store：图片模板渲染鉴权放行（本地版无计费）。"""
    path = os.path.join(CP_BACKEND, 'template_store.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    if '本地版不收费，所有模板可直接渲染' in src:
        return 0
    old_t = '''    pricing = get_pricing(template)
    if not is_paid(pricing):
        return pricing
    conn = get_db()
    _ensure_tables(conn)
    acc = user_access(conn, username or "", template.get("id", ""))
    conn.close()
    if acc is None:
        raise HTTPException(
            402,
            f"该模板为付费模板，请先购买（按次 {pricing['once']} / 按天 {pricing['day']} / "
            f"按月 {pricing['month']} 积分）",
        )
    return pricing'''
    new_t = '''    return get_pricing(template)  # 本地版不收费，所有模板可直接渲染'''
    if old_t in src:
        src = src.replace(old_t, new_t, 1)
        open(path, 'w', encoding='utf-8').write(src)
        return 1
    return 0


def _patch_auth_stale_token() -> int:
    """common/auth：旧 token（用户已删/旧后端残留）→ 401 触发免登录恢复；quota 防御性取值。"""
    path = os.path.join(CP_BACKEND, 'common', 'auth.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 1. get_current_user 校验用户存在
    if '登录状态已失效，请重新登录' not in src:
        old = '''    payload = decode_access_token(token)
    user_id = payload.get("user_id")
    # 模式 B：加载用户中转站 key 并注入请求上下文（所有 AI 调用按用户走中转站 token）'''
        new = '''    payload = decode_access_token(token)
    user_id = payload.get("user_id")
    # 校验用户仍存在（旧版本 token / 用户已被清理时 → 401，前端触发免登录恢复）
    if user_id:
        from common.db import get_db

        _c = get_db()
        try:
            _exists = _c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone()
        finally:
            _c.close()
        if not _exists:
            raise HTTPException(401, "登录状态已失效，请重新登录")
    # 模式 B：加载用户中转站 key 并注入请求上下文（所有 AI 调用按用户走中转站 token）'''
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 2. get_quota_info 返回块防御性取值（guest 档案不 500）
    if 'profile.get("daily_quota", 30)' not in src:
        old = '''        "daily_quota": profile["daily_quota"],
        "bonus_quota": profile["bonus_quota"],
        "used_today": profile["used_today"],
        "remaining_today": profile["remaining_today"],
        "total_usage": profile["total_usage"],
    }'''
        new = '''        "daily_quota": profile.get("daily_quota", 30),
        "bonus_quota": profile.get("bonus_quota", 0),
        "used_today": profile.get("used_today", 0),
        "remaining_today": profile.get("remaining_today", 30),
        "total_usage": profile.get("total_usage", 0),
    }'''
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(src)
    return n


def _patch_relay_save_models() -> int:
    """relay_api：保存用户 Key 时拉取中转站模型列表并保存；清除时清空模型。"""
    path = os.path.join(CP_BACKEND, 'relay_api.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 1. PUT /me 拉取模型（以返回字段为幂等标记）
    if '"model_hint": "模型列表已从中转站同步"' not in src:
        old = '''    with get_db_context() as conn:
        conn.execute(
            "UPDATE users SET relay_api_key=?, relay_api_base='' WHERE id=?",
            (api_key, uid),
        )
    return {
        "success": True,
        "message": "中转站 Key 已保存，AI 功能将使用你的 Key 计费（仅支持本站签发的 Key）",
        "api_key_masked": _mask_key(api_key),
        "api_base": _DEFAULT_BASE,
    }'''
        new = '''    # 拉取该中转站的模型列表并保存（本地版模型不写死，全部来自用户中转站）
    models_saved = 0
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{_DEFAULT_BASE}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                raw = data.get("data") if isinstance(data, dict) else data
                if isinstance(raw, list):
                    model_list = [
                        {"name": m.get("id")} for m in raw if isinstance(m, dict) and m.get("id")
                    ]
                    if model_list:
                        from common.db import get_db_context

                        with get_db_context() as conn:
                            conn.execute(
                                "INSERT INTO config (key, value) VALUES ('model_list',?) "
                                "ON CONFLICT(key) DO UPDATE SET value=?",
                                (
                                    json.dumps(model_list, ensure_ascii=False),
                                    json.dumps(model_list, ensure_ascii=False),
                                ),
                            )
                        models_saved = len(model_list)
    except Exception:
        pass

    with get_db_context() as conn:
        conn.execute(
            "UPDATE users SET relay_api_key=?, relay_api_base='' WHERE id=?",
            (api_key, uid),
        )
    return {
        "success": True,
        "message": "中转站 Key 已保存，AI 功能将使用你的 Key 计费",
        "api_key_masked": _mask_key(api_key),
        "api_base": _DEFAULT_BASE,
        "models": models_saved,
        "model_hint": "模型列表已从中转站同步" if models_saved else "已保存 Key（模型列表同步失败，请重试或检查中转站）",
    }'''
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 2. DELETE /me 清空模型列表
    if "DELETE FROM config WHERE key='model_list'" not in src:
        old = '''    with get_db_context() as conn:
        conn.execute(
            "UPDATE users SET relay_api_key='', relay_api_base='' WHERE id=?",
            (uid,),
        )
    return {"success": True, "message": "已清除中转站配置，回退平台默认计费"}'''
        new = '''    with get_db_context() as conn:
        conn.execute(
            "UPDATE users SET relay_api_key='', relay_api_base='' WHERE id=?",
            (uid,),
        )
        conn.execute("DELETE FROM config WHERE key='model_list'")
    return {"success": True, "message": "已清除中转站配置与模型列表，请重新配置 Key 后使用 AI 功能"}'''
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(src)
    return n


def _patch_no_hardcoded_models() -> int:
    """各工厂：未选择模型时明确报错（不写死 agnes 默认），同步后重新接入。"""
    edits = [
        ('image_factory.py',
         'model = payload.get("model") or IMAGE_MODEL',
         'model = require_model(payload.get("model") or IMAGE_MODEL, "图片")'),
        ('image_factory.py',
         'from common.config import IMAGE_MODEL\n',
         'from common.config import IMAGE_MODEL, require_model\n'),
        ('image_factory.py',
         '        tryon_request = {\n            "model": IMAGE_MODEL,',
         '        from common.config import require_model\n\n        _tryon_model = require_model(IMAGE_MODEL, "AI 试衣")\n        tryon_request = {\n            "model": _tryon_model,'),
        ('image_factory.py',
         '    body = {\n        "model": "agnes-video-v2.0",',
         '    from common.config import VIDEO_MODEL, require_model\n\n    _turntable_vid_model = require_model(payload.get("model") or VIDEO_MODEL, "视频")\n    body = {\n        "model": _turntable_vid_model,'),
        ('image_factory.py',
         '                        "model": IMAGE_MODEL,\n                        "prompt": f"{ai_background.strip()}, wide background',
         '                        "model": require_model(IMAGE_MODEL, "图片"),\n                        "prompt": f"{ai_background.strip()}, wide background'),
        ('video_factory.py',
         'model = payload.get("model") or VIDEO_MODEL',
         'model = require_model(payload.get("model") or VIDEO_MODEL, "视频")'),
        ('video_factory.py',
         'from common.config import VIDEO_MODEL\n\n    prompt = (payload.get("prompt") or "").strip()',
         'from common.config import VIDEO_MODEL, require_model\n\n    prompt = (payload.get("prompt") or "").strip()'),
        ('meme_factory.py',
         'from common.config import IMAGE_MODEL\n',
         'from common.config import IMAGE_MODEL, require_model\n'),
        ('meme_factory.py',
         '            "model": IMAGE_MODEL,\n            "prompt": prompt,\n            "size": "1024x1024",',
         '            "model": require_model(IMAGE_MODEL, "表情包"),\n            "prompt": prompt,\n            "size": "1024x1024",'),
        ('digital_human.py',
         'from common.config import AGNES_API_BASE, AGNES_API_KEY, IMAGE_MODEL, resolve_api_key',
         'from common.config import AGNES_API_BASE, AGNES_API_KEY, IMAGE_MODEL, require_model, resolve_api_key'),
        ('digital_human.py',
         '            payload = {\n                "model": IMAGE_MODEL,',
         '            payload = {\n                "model": require_model(IMAGE_MODEL, "图片"),'),
        ('short_drama.py',
         'from common.config import IMAGE_MODEL\n        from common.llm import api_error_detail',
         'from common.config import IMAGE_MODEL, require_model\n        from common.llm import api_error_detail'),
        ('short_drama.py',
         '        body = {\n            "model": IMAGE_MODEL,',
         '        body = {\n            "model": require_model(IMAGE_MODEL, "图片"),'),
        ('ai_video_api.py',
         '    body = {\n        "model": "agnes-video-v2.0",',
         '    from common.config import require_model\n\n    body = {\n        "model": require_model(payload.get("model") or None, "视频"),'),
        # stats api_configured 按用户中转站 Key 判断（AGNES_API_KEY 全局已置空）
        ('image_factory.py',
         '    return {\n        "total_images": len(files),\n        "total_templates": len(templates),\n        "image_dir": IMAGE_DIR,\n        "api_configured": bool(AGNES_API_KEY),\n    }',
         '    return {\n        "total_images": len(files),\n        "total_templates": len(templates),\n        "image_dir": IMAGE_DIR,\n        "api_configured": bool(resolve_api_key()),\n    }'),
        ('music_factory.py',
         '    return {\n        "total_tracks": music_count,\n        "api_configured": bool(AGNES_API_KEY),',
         '    return {\n        "total_tracks": music_count,\n        "api_configured": bool(resolve_api_key()),'),
    ]
    n = 0
    for fname, old_t, new_t in edits:
        p = os.path.join(CP_BACKEND, fname)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        # 幂等保护：导入类编辑（行尾是换行、无前缀上下文）已含 require_model 时跳过，
        # 避免 'from common.config import IMAGE_MODEL' 成为替换结果子串而重复追加
        if old_t.endswith('\n') and 'require_model' in new_t and 'require_model' in s:
            continue
        if old_t in s:
            s = s.replace(old_t, new_t, 1)
            open(p, 'w', encoding='utf-8').write(s)
            n += 1
    return n


def _patch_task_queue_relay() -> int:
    """task_queue：后台任务恢复用户中转站 key + master 循环缺列自愈。"""
    path = os.path.join(CP_BACKEND, 'task_queue.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # master 循环自愈：缺列时重新迁移 + 错误日志限流
    if 'task master loop error' in src and '_last_master_err' not in src:
        old_t = '''        except Exception:
            logger.exception("task master loop error")
            time.sleep(2)'''
        new_t = '''        except Exception:
            # 自愈：任务表缺列/结构过期时重新迁移（旧库升级、启动期 ALTER 被锁跳过等场景），
            # 避免 master 循环每秒崩溃刷屏；错误日志限流 30s 一次
            try:
                _c = get_db()
                try:
                    _ensure_table(_c)
                finally:
                    _c.close()
            except Exception:
                pass
            global _last_master_err
            if time.time() - _last_master_err > 30:
                logger.exception("task master loop error")
                _last_master_err = time.time()
            time.sleep(2)'''
        if old_t in src:
            src = src.replace(old_t, new_t, 1)
            n += 1
            if '_last_master_err = 0.0' not in src:
                src = src.replace('def _master_loop() -> None:', '_last_master_err = 0.0\n\n\ndef _master_loop() -> None:', 1)
    if '后台任务恢复用户的中转站 key' in src:
        if 'resolve_feature_model(_uid, "default", "")' not in src:
            old_t = '''        _relay = get_user_relay_config(_uid) if _uid else None
        set_relay_context(_relay if _relay and _relay.get("api_key") else None)'''
            new_t = '''        _relay = get_user_relay_config(_uid) if _uid else None
        if _relay and _relay.get("api_key"):
            try:
                from common.config import resolve_feature_model

                _relay["default_model"] = resolve_feature_model(_uid, "default", "")
            except Exception:
                pass
            set_relay_context(_relay)
        else:
            set_relay_context(None)'''
            if old_t in src:
                src = src.replace(old_t, new_t, 1)
                n += 1
        if n:
            open(path, 'w', encoding='utf-8').write(src)
        return n
    old = '''    ctx = {"username": row["created_by"] or "", "user_id": row["user_id"] or "", "role": row["role"] or ""}
    try:
        result = fn(task_id, payload, lambda p, s: _update_progress(task_id, p, s), ctx)'''
    new = '''    ctx = {"username": row["created_by"] or "", "user_id": row["user_id"] or "", "role": row["role"] or ""}
    # 模式 B：后台任务恢复用户的中转站 key（ContextVar 只在请求作用域内传递）
    try:
        from common.auth import get_user_relay_config
        from common.relay_context import set_relay_context

        _uid = row["user_id"] or ""
        _relay = get_user_relay_config(_uid) if _uid else None
        set_relay_context(_relay if _relay and _relay.get("api_key") else None)
    except Exception:
        pass
    try:
        result = fn(task_id, payload, lambda p, s: _update_progress(task_id, p, s), ctx)'''
    if old not in src:
        return 0
    src = src.replace(old, new, 1)
    # finally 中清理 context
    old2 = '''    finally:
        _progress_throttle.pop(task_id, None)'''
    new2 = '''    finally:
        try:
            from common.relay_context import clear_relay_context

            clear_relay_context()
        except Exception:
            pass
        _progress_throttle.pop(task_id, None)'''
    if old2 in src:
        src = src.replace(old2, new2, 1)
    open(path, 'w', encoding='utf-8').write(src)
    return 1


def apply_all() -> int:
    """应用全部定制补丁，返回补丁数。"""
    total = 0
    total += _patch_extended_api()
    total += _patch_relay_api()
    total += _patch_digital_human()
    total += _patch_task_queue()
    total += _patch_short_drama()
    total += _patch_stock_reports_order()
    total += _patch_image_factory_render()
    total += _patch_config_relay_models()
    total += _patch_config_relay_base()
    total += _patch_auth_relay_quota()
    total += _patch_relay_save_models()
    total += _patch_no_hardcoded_models()
    total += _patch_task_queue_relay()
    total += _patch_auth_stale_token()
    total += _patch_video_templates_free()
    total += _patch_template_store_free()
    total += _patch_voice_dh_models()
    return total


if __name__ == '__main__':
    n = apply_all()
    print(f'[patch] 应用 {n} 处定制补丁')
