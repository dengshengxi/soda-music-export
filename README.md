# 汽水音乐歌单导出工具

把汽水音乐（Soda Music）桌面端里的收藏歌曲，导出成可以直接粘贴进 QQ 音乐 / 网易云的歌单清单。

**核心特点：全程在自己电脑的浏览器里解析，文件不上传、不联网、不落盘。**

- 官网：<https://4n76rxk01y665.villa.functorz-app.com>
- 在线工具：<https://qq48gy6vpn88r.villa.functorz-app.com>

---

## 它是怎么工作的

汽水音乐是 Electron 应用，它把前端 react-query 的请求缓存写进了 Chromium 的
`Local Storage`（底层是 **LevelDB**）。只要你在客户端里打开过某个歌单，这份数据
就留在本地磁盘上了。

本工具做的事：

1. 你手动把 `Local Storage\leveldb` 文件夹拖进网页；
2. 网页用纯 JS 的 LevelDB 解析器（含 Snappy 解压）读出 SSTable / WAL；
3. 找到 `useRequestCache:playlist_detail:<歌单ID>` 这条缓存；
4. 取出 `data.media_resources[].entity.track_wrapper.track` 里的曲目；
5. 按你选的字段（歌名 / 歌手 / 专辑 / 序号 / 分隔符 / 顺序）渲染成文本。

没有后端、没有爬虫、没有破解 —— 只是读你自己硬盘上的缓存文件。

---

## 使用步骤

1. 打开汽水音乐，点进想导出的歌单（比如「我喜欢的音乐」），让它完整加载一次。
2. `Win + R` → 输入 `%APPDATA%\SodaMusic\Local Storage\leveldb` → 回车。
3. 把整个文件夹（或里面的文件）拖到工具网页里。
4. 勾选要导出的歌单 → 点「复制导入文本」。
5. 打开 QQ 音乐 → 我的 → 导入外部歌单 → 粘贴。

> 支持导出**任意歌单**，不只是「我喜欢的音乐」。页面会列出缓存里所有歌单并标注归属，
> 可多选，也能勾选「跨歌单去重」。

---

## 目录结构

| 目录 / 文件 | 说明 |
| --- | --- |
| `website/` | **在线工具**（已部署）。`index.html` / `app.js` / `leveldb.js` / `snappy.js` / `help.html` |
| `website/qqmusic.html` | QQ 音乐方向的落地页（由脚本生成，见下） |
| `website/qqcap.js` | QQ 音乐抓取脚本的源码（唯一真实来源） |
| `site/` | **产品官网**（已部署）。`index.html` / `auth.js` / `help.html` |
| `_tools/` | 本地辅助脚本：LevelDB 解析调试、页面生成器、单测 |
| `output/` | 本地跑出来的导出样例（已 gitignore，含个人听歌记录） |

### `_tools/` 里值得看的几个

| 脚本 | 作用 |
| --- | --- |
| `lvlite3.py` | 可用的 Python 版 LevelDB 解析器（需 `cramjam` 才能解 Snappy） |
| `export_songs.py` | 命令行版导出，不依赖浏览器 |
| `gen_qqmusic_page.js` | 把 `qqcap.js` 内联进 `qqmusic.html`（改完 qqcap.js 必须重跑） |
| `test_qqcap.js` | 抽取 `qqmusic.html` 里的**内联脚本**跑测试 —— 保证「测的就是发的」 |
| `smoke_web.js` | 用真实汽水缓存跑一遍 `leveldb.js` 的冒烟测试 |

改完 `website/qqcap.js` 后：

```bash
node _tools/gen_qqmusic_page.js   # 重新生成 qqmusic.html
node _tools/test_qqcap.js         # 跑测试，必须全绿
```

---

## 关于「反向导出 QQ 音乐」

**结论：做不到完整导出，已放弃。**

试过并且全部失败的路径，记录在此免得有人再踩一遍：

| 路线 | 为什么不行 |
| --- | --- |
| 读本地数据库 | QQ 音乐是原生 Qt，`qmlist64.db` 文件头不是 `SQLite format 3`，**加密** |
| 读 Local Storage | 不是 Electron，根本没有 leveldb |
| 网页端 hook XHR/fetch | 歌曲是 **SSR 直出**的，页面发 0 条 XHR，hook 不到任何东西 |
| 翻页补齐 | 网页版个人主页**没有翻页**，只给前若干首 |
| 自己调接口 | Cookie 是 `HttpOnly`，JS 读不到 `p_skey`，算不出 `g_tk` |
| JSONP | y.qq.com 的 CSP 拦外部 `<script>` |
| 公共歌单 | 同样看不全 |

`website/qqmusic.html` 保留了一个书签小工具，它**只能抓到页面上当前可见的那些歌**
（实测 10 首），如果你只想要「眼前这几首」，它还能用；想导出完整歌单，请放弃。

---

## 本地运行

```bash
cd website
python -m http.server 8777
# 打开 http://127.0.0.1:8777
```

直接双击 `index.html` 也能用 —— 脚本用的是经典 `<script>` 标签，不受 `file://` 限制。

---

## 部署

整站是纯静态文件，丢到任意静态托管即可，无需后端。

当前部署在 Zion（functorz.com）的两个项目上（官网和工具站是分开的两个项目，用绝对
URL 互链）。**Zion 没有增量同步，改完任一侧都要整体重新部署。**

---

## 隐私

- 工具页**不设登录**，这是它的卖点（"不用登录任何账号"）。
- 官网上的账号系统是**本地账号**：`localStorage` + salt/SHA-256，没有任何服务端。
- 所有解析都在浏览器内存里完成，选中的文件不会被发送到任何地方。

## License

MIT
