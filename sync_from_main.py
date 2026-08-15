#!/usr/bin/env python3
"""content-platform ↔ 主仓库同步升级脚本。

用法（在 Code-Platform 仓库根目录运行）：
    python3 content-platform/sync_from_main.py            # 同步后端模块
    python3 content-platform/sync_from_main.py --frontend # 同步后端+前端

功能：
- 从主仓库 backend/ 复制「内容创作+工具」模块到 content-platform/backend/
  （自动排除研发管理/智能体相关模块）
- 从主仓库 frontend/src 同步页面（但保留 content-platform 的精简 App.jsx/Sidebar）
- 生成同步报告，便于查看哪些模块已更新

原理：content-platform 是主仓库的「子集分发版」——
主仓库迭代新功能后，运行本脚本即可把相关模块同步过来。
"""

import os
import re
import shutil
import sys
from datetime import datetime

# 路径
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_BACKEND = os.path.join(ROOT, 'backend')
MAIN_FRONTEND = os.path.join(ROOT, 'frontend', 'src')
CP_BACKEND = os.path.join(ROOT, 'content-platform', 'backend')
CP_FRONTEND = os.path.join(ROOT, 'content-platform', 'frontend', 'src')

# ── 同步清单：主仓库 → content-platform 的后端模块 ──────────
# 内容创作工厂
CREATION_MODULES = [
    'image_factory.py', 'video_factory.py', 'music_factory.py', 'voice_factory.py',
    'meme_factory.py', 'game_factory.py', 'miniapp.py', 'short_drama.py',
    'digital_human.py', 'voice_clone.py', 'voice_chat.py', 'voice_templates.py',
    'image_edit_engine.py', 'drama_templates.py', 'meme_templates.py',
    'video_templates.py', 'music_scene_templates.py',
]
# 应用与工具
TOOL_MODULES = [
    'tool_hub.py', 'pdf_tools.py', 'mindmap.py', 'seo_analyzer.py', 'stock_tools.py',
    'data_analyzer.py', 'data_forecast.py', 'content_strategy.py', 'growth_engine.py',
    'smart_dashboard.py', 'competitor_monitor.py', 'doc_qa.py', 'web_search.py',
    'publishing.py', 'video_analyzer.py', 'ai_video_api.py', 'favorites_api.py',
    'search_api.py', 'realtime.py', 'extended_api.py', 'template_store.py',
    'templates_market.py', 'pdf_doc_templates.py', 'mindmap_templates.py',
    'dh_gateway.py', 'edge_tts_worker.py', 'apikey_api.py',
]
# 支撑模块（公共依赖）
SUPPORT_MODULES = [
    'content_safety.py', 'publish_kit.py', 'task_queue.py', 'template_base.py',
    'relay_api.py', 'admin_api.py', 'permissions.py', 'portals.py',
    'seed_templates.py', 'drafts.py', 'gallery.py',
]
# 模板目录
TEMPLATE_DIRS = ['drama_templates', 'meme_templates', 'video_templates',
                 'music_scene_templates', 'mindmap_templates', 'pdf_doc_templates']

def sync_backend(verbose=True):
    """同步后端模块。"""
    synced = []
    for m in CREATION_MODULES + TOOL_MODULES + SUPPORT_MODULES:
        src = os.path.join(MAIN_BACKEND, m)
        dst = os.path.join(CP_BACKEND, m)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            synced.append(m)
    for d in TEMPLATE_DIRS:
        src = os.path.join(MAIN_BACKEND, d)
        dst = os.path.join(CP_BACKEND, d)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
            synced.append(d + '/')
    # 同步 common/（公共库）
    shutil.copytree(
        os.path.join(MAIN_BACKEND, 'common'),
        os.path.join(CP_BACKEND, 'common'),
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('__pycache__'),
    )
    synced.append('common/')
    # 同步 requirements（合并：主仓库 + content-platform 独有依赖如 pandas/yfinance）
    req_src = os.path.join(MAIN_BACKEND, 'requirements.txt')
    req_dst = os.path.join(CP_BACKEND, 'requirements.txt')
    if os.path.exists(req_src):
        main_lines = [l.strip() for l in open(req_src, encoding='utf-8').read().splitlines() if l.strip()]
        cp_lines = [l.strip() for l in open(req_dst, encoding='utf-8').read().splitlines() if l.strip()] if os.path.exists(req_dst) else []
        # 合并去重，保留顺序（主仓库在前，content-platform 独有追加在后）
        merged = []
        seen = set()
        for l in main_lines + cp_lines:
            # 取依赖名（==/>= 前的包名）做去重键
            key = l.split('>=')[0].split('==')[0].strip().lower()
            if key and key not in seen and not l.startswith('#'):
                seen.add(key)
                merged.append(l)
            elif l.startswith('#') and l not in merged:
                merged.append(l)
        new_reqs = '\n'.join(merged) + '\n'
        if new_reqs != open(req_dst, encoding='utf-8').read() if os.path.exists(req_dst) else True:
            open(req_dst, 'w', encoding='utf-8').write(new_reqs)
            synced.append('requirements.txt')
    if verbose:
        print(f'[sync] 后端同步完成：{len(synced)} 项')
        for s in synced:
            print(f'  ✓ {s}')
    return synced


# 前端定制文件：sync 不覆盖（content-platform 特有精简/适配，由 patches.py 维护）
CUSTOM_FRONTEND_FILES = {
    'App.jsx',
    'components/Sidebar.jsx',
    'pages/ProfilePage.jsx',
    # 本地免费版深度精简：无登录墙/无会员/无研发入口（主仓库更新不覆盖）
    'pages/LoginPage.jsx',
    'pages/HomePage.jsx',
    'pages/HelpPage.jsx',
    'pages/DashboardPage.jsx',
    'pages/SearchPage.jsx',
    'pages/ToolHubPage.jsx',
    'pages/ToolRunPage.jsx',
    'pages/DigitalHumanPage.jsx',
    'pages/NotificationsPage.jsx',
    'pages/StockAnalysisPage.jsx',
    'components/AccessGuard.jsx',
    'components/CommandPalette.jsx',
    'components/OnboardingTour.jsx',
    'components/FloatingAssistant.jsx',
    'components/MobileBottomNav.jsx',
    'lib/pageTitle.js',
    'hooks/useRecentTools.js',
    'hooks/useAccess.js',
}


def sync_frontend(verbose=True):
    """同步前端页面（保留 content-platform 的精简 App.jsx/Sidebar/ProfilePage）。"""
    synced = []
    # 同步 pages/（删除的研发页面不复制回来——只同步存在的页面）
    src_pages = os.path.join(MAIN_FRONTEND, 'pages')
    dst_pages = os.path.join(CP_FRONTEND, 'pages')
    for fn in os.listdir(src_pages):
        if not fn.endswith('.jsx'):
            continue
        src = os.path.join(src_pages, fn)
        dst = os.path.join(dst_pages, fn)
        rel = 'pages/' + fn
        if rel in CUSTOM_FRONTEND_FILES:
            continue  # 定制页面不覆盖（content-platform 特有精简）
        if os.path.exists(dst):
            # 只覆盖 content-platform 已存在的页面（保持精简清单，不新增研发/智能体页）
            shutil.copy2(src, dst)
            synced.append(rel)
    # 同步 components/ lib/ hooks/（公共组件与工具）
    for sub in ('components', 'lib', 'hooks', 'i18n'):
        src = os.path.join(MAIN_FRONTEND, sub)
        dst = os.path.join(CP_FRONTEND, sub)
        if os.path.isdir(src):
            # 逐文件同步，跳过定制文件
            for fn in os.listdir(src):
                rel = f'{sub}/{fn}'
                if rel in CUSTOM_FRONTEND_FILES:
                    continue
                s = os.path.join(src, fn)
                d = os.path.join(dst, fn)
                if os.path.isfile(s):
                    shutil.copy2(s, d)
            synced.append(sub + '/')
    # 注意：不覆盖 content-platform 的精简版 App.jsx / Sidebar.jsx
    if verbose:
        print(f'[sync] 前端同步完成：{len(synced)} 项（App.jsx/Sidebar.jsx 保持精简版）')
    return synced


if __name__ == '__main__':
    only_backend = '--frontend' not in sys.argv
    print(f'=== content-platform 同步 {datetime.now().strftime("%Y-%m-%d %H:%M")} ===')
    sync_backend()
    if not only_backend:
        sync_frontend()
    # 同步会覆盖 content-platform 的定制，重新应用补丁
    from patches import apply_all

    n = apply_all()
    print(f'[sync] 定制补丁：{n} 处已重新应用')
    print('=== 完成。同步后建议：cd content-platform/frontend && npx vite build 重建前端 ===')
