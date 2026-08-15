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
    """common/auth：配置中转站 Key 的用户额度不限（按 token 计费）+ 资料返回 relay_configured。"""
    path = os.path.join(CP_BACKEND, 'common', 'auth.py')
    if not os.path.exists(path):
        return 0
    src = open(path, encoding='utf-8').read()
    n = 0
    # 1. consume_quota 放行
    if 'row.get("relay_api_key")' not in src:
        old = '    if row.get("role") == "admin":\n        return {"allowed": True, "remaining": 9999, "charged": False}\n    today = _today()'
        new = ('    if row.get("role") == "admin":\n        return {"allowed": True, "remaining": 9999, "charged": False}\n'
               '    # 模式 B：配置了中转站 Key 的用户按 token 计费，平台不限次数\n'
               '    if row.get("relay_api_key"):\n'
               '        return {"allowed": True, "remaining": 9999, "charged": False}\n'
               '    today = _today()')
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 2. get_quota_info 放行
    if '"relay_billed": True' not in src:
        old = '    _maybe_send_expiry_notice(user_id)  # 惰性发送到期提醒（≤3 天，去重）\n    # 会员剩余天数（含到期日当天，用于前端到期提醒）'
        new = ('    _maybe_send_expiry_notice(user_id)  # 惰性发送到期提醒（≤3 天，去重）\n'
               '    # 模式 B：配置了中转站 Key 的用户按 token 计费，平台不限次数\n'
               '    if profile.get("relay_configured"):\n'
               '        return {\n'
               '            "membership": "free", "membership_expires": None, "membership_days_left": None,\n'
               '            "username": profile.get("username", ""), "role": profile.get("role", ""),\n'
               '            "daily_quota": None, "bonus_quota": 0, "used_today": 0,\n'
               '            "remaining_today": 9999, "total_usage": profile.get("total_usage", 0),\n'
               '            "relay_billed": True,\n'
               '        }\n'
               '    # 会员剩余天数（含到期日当天，用于前端到期提醒）')
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
    # 3. get_user_profile 返回 relay_configured
    if '"relay_configured": bool(row.get("relay_api_key"))' not in src:
        old = '        "created_at": row.get("created_at"),\n    }'
        new = '        "created_at": row.get("created_at"),\n        "relay_configured": bool(row.get("relay_api_key")),\n    }'
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
    return total


if __name__ == '__main__':
    n = apply_all()
    print(f'[patch] 应用 {n} 处定制补丁')
