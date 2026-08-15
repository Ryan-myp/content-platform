# 小团智能 · 内容创作平台（独立版）

AI 内容创作与效率工具的一键部署包（不含代码/Agent/PRD 模块）。

## 功能
- **图片工坊**：文生图/图生图/模板/试衣/编辑
- **视频工坊**：文生视频/图生视频/自动字幕/分析/滤镜
- **音乐工坊**：AI 编曲/歌词/封面/发布包
- **配音工坊**：TTS/长文分段/字幕
- **表情包**：经典/AI/GIF 动图/微信打包
- **小游戏/小程序**：AI 生成 + 预览 + 导出
- **数字人**：2D 渲染/lip-sync/批量
- **效率工具箱**：65+ 工具（11 个实算工具）

## 商业模式（模式 B）
- 所有 AI 调用走**平台中转站**（URL 写死，用户不可改）
- 用户填写**本站签发的中转站 Key** → AI 功能用用户 Key 计费
- 未填 Key 用户使用平台默认额度
- 平台通过中转站 token 差价盈利

## 启动
```bash
cd backend
pip install -r requirements.txt
python app_creation.py        # 默认 8888，PORT 可覆盖
```

## npx 一键部署
```bash
npx @ryan-myp/code-platform web
```

## 升级机制（content-platform ↔ 主仓库）

content-platform 是主仓库的「子集分发版」（内容创作 + 工具，不含研发/智能体/商业化 UI）。

主仓库迭代新功能后，一键同步到 content-platform：

```bash
cd Code-Platform
python3 content-platform/sync_from_main.py            # 同步后端模块
python3 content-platform/sync_from_main.py --frontend  # 同步后端 + 前端页面
```

同步脚本自动：
- 复制内容创作 + 工具模块（排除研发/智能体/支付/协作）
- 保留 content-platform 的定制（精简 App.jsx/Sidebar、prd_engine 兜底等）
- 生成同步报告

## 本地免费版说明

- 所有内容本地运行，无会员/分享/邀请等商业化 UI
- AI 功能使用用户填写的中转站 Key（URL 平台写死），平台通过中转站 token 盈利
