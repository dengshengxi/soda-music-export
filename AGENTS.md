# AGENTS.md

> 这是本项目的「系统提示词」。任何 AI 工具读写这个项目里的文件时，都会自动加载它。
> 动手改代码之前，先读完这份文件。完整版说明见 `手册.md`。

## 这个项目在做什么

把**汽水音乐**（Electron 桌面端）里收藏的歌曲**离线导出**，给别人导入 QQ 音乐 / 网易云用。
核心路线：读 Electron 的 `Local Storage` LevelDB 缓存，从 react-query 的
`useRequestCache:playlist_detail:*` 里还原歌单。

全部解析都在用户自己的浏览器里做，**不上传、不联网**。

## 目录结构

```
website/   导出工具（index.html / app.js / leveldb.js / snappy.js / help.html）→ 工具站
site/      官网（index.html / help.html / auth.js）→ 官网
_tools/    本地脚本（Python 解析/导出 + Node 测试）
output/    导出的歌单产物（不入库）
```

## 技术选型与运行方式

- **纯前端**，用经典 `<script>` 标签（**不是** `type="module"`），所以 `file://` 双击就能跑。
  改成 module 会直接让本地双击失效。
- 部署在 Zion（functorz.com），官网和工具站是**两个独立项目**，用绝对 URL 互链。
- `_tools/` 里 Python 用 3.13，Node 用 22。

## 生成物 —— 不要手改

- **`website/qqmusic.html` 由 `_tools/gen_qqmusic_page.js` 生成**（它把 `qqcap.js` 内联进页面）。
  改抓取逻辑要改 `website/qqcap.js`，然后**重跑生成脚本**，再跑 `_tools/test_qqcap.js`。
- `site/help.html` 和 `website/help.html` 内容一致，只有导航链接不同；改一处要同步另一处。

## 硬约束（违反即停）

1. **所有文件只允许写在项目根目录里**，不要散落到临时目录、桌面或系统目录。
   诊断脚本、日志也放进 `_tools/`。
2. **绝对禁止任何会产生费用的操作**（套餐升级、扩容、购买配额、付费发布）。
   遇到「需要付费才能继续」的环节，停下来问用户。
3. **不要删除文件**。沙箱安全策略会拦截批量删除，脚本里不要写 `os.remove` / `shutil.rmtree`。
4. **不许动个人目录**（Desktop / Downloads / Documents / Home 等）。
5. 改动涉及隐私数据（歌单、缓存转储、token）时，一律留在本地、不入库。

## 改完要做什么

1. **跑回归**（见 `手册.md` 第 7 章）：
   ```bash
   node _tools/smoke_web.js        # 汽水音乐解析
   node _tools/test_js_parser.js   # JS 版 vs Python 版一致性
   node _tools/test_qqcap.js       # 改了 qqcap.js 必跑
   ```
2. 改了 `website/` 或 `site/` 的**任何文件**，都要**整体重新部署**到 Zion —— Zion 没有增量同步。
3. 提交前先看 `git diff --stat` / `git diff`，确认没有误删、没有夹带。

## 本机的两个坑

- **有 TLS 拦截代理**：`git push` 要 `git -c http.sslVerify=false push`，
  curl 要 `-k`，Node 要 `NODE_TLS_REJECT_UNAUTHORIZED=0`。
- **探 localhost 端口要 `curl --noproxy '*'`**，否则被系统代理吃掉，会误报连接被拒。

## 已知限制（别重复踩）

反向导出 **QQ 音乐**的完整歌单**做不到**：客户端是原生 Qt（`qmlist64.db` 加密），
网页版不分页且是 SSR 直出、Cookie 是 HttpOnly。工具只能抓页面上当前显示的那几首，
相关文案必须如实标注，不要夸大成「双向支持」。
