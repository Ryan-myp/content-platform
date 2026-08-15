# 小团智能 · 内容创作平台（独立版）

AI 内容创作与效率工具的一键部署包（不含代码/Agent/PRD 模块）。
**本地免费运行，免注册登录**：首次打开自动进入主页，AI 费用由你配置的中转站 Key 计费。

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

无需注册登录：后端提供 `POST /api/auth/auto` 免登录接口，前端首次打开自动创建本地用户并直接进入主页（若已配置过中转站 Key 的用户则自动复用，升级不丢配置）。

## npx 一键部署
```bash
npx @ryan-myp/code-platform web
```

> ⚠️ 国内 npm 镜像（npmmirror）同步滞后，可能导致 npx 拉到旧版本（旧版有登录页/研发入口）。
> 若看到登录页或研发管理菜单，请用官方源安装最新版：
> ```bash
> npx --registry=https://registry.npmjs.org @ryan-myp/code-platform web
> ```
> 启动时会自动检测并提示新版本；端口冲突自动改号，请以「✨ 平台已就绪」横幅中的实际前端地址为准
> （旧实例残留时，不要打开端口冲突前那个端口，那可能是旧版本服务）。

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

- 所有内容本地运行，**免注册登录**（自动登录本地用户），数据仅存本机
- 无会员/付费墙：AccessGuard 全部放行，无水印锁、无 1080P 锁、无「升级会员」引导
- 水印为可自由开关的显式选项；1080P 直接可选
- 每日 30 次生成额度防滥用（次日 0 点自动重置），AI 实际费用走用户中转站 Key
- 平台通过中转站 token 差价盈利（用户填写本站签发 Key，URL 平台写死）

## 常见问题

### 端口被占用 / 想自定义端口
```bash
# 自定义端口：--port=前端 --backend-port=后端
npx @ryan-myp/code-platform web --port 8080 --backend-port 9000

# 端口被占用时自动换可用端口（无需手动处理）
```

### 更新 / 重装到最新版
```bash
rm -rf ~/.cache/code-platform ~/.npm/_npx   # 清缓存
npx @ryan-myp/code-platform web              # 重新下载运行
```

### 完全卸载
```bash
rm -rf ~/.cache/code-platform ~/.npm/_npx   # 清全部本地数据
```
