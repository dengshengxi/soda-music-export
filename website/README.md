# 汽水音乐 · 收藏歌曲导出（网页版）

把汽水音乐桌面端里的收藏歌曲导出成可直接粘贴进 QQ 音乐的清单。
**纯前端，文件只在你自己的浏览器里解析，不上传、不联网、不落盘。**

## 本地打开

```bash
cd website
python -m http.server 8777
# 浏览器打开 http://127.0.0.1:8777
```

直接双击 `index.html` 也能用（脚本用的是经典 script 标签，不受 file:// 限制）。

## 使用步骤

1. 打开汽水音乐，点进想导出的歌单（如「我喜欢的音乐」），让它加载一次 —— 客户端会把数据写进本地缓存。
2. `Win` + `R` → 输入 `%APPDATA%\SodaMusic\Local Storage\leveldb` → 回车。
3. 把整个文件夹（或里面的文件）拖到网页里。
4. 点「复制导入文本」→ 打开 QQ 音乐 → 我的 → 导入外部歌单 → 粘贴。

## 文件结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面结构与样式 |
| `app.js` | 交互逻辑：读文件 → 解析 → 渲染 → 导出 |
| `leveldb.js` | LevelDB 读取器（SSTable `.ldb` + WAL `.log`），含 UTF-16 偏移自愈解码 |
| `snappy.js` | Snappy raw block 解压，纯 JS 无依赖 |

## 实现要点

- LevelDB SSTable 的 `BlockHandle.size` **不含** 5 字节 trailer，trailer 紧跟在 `off + size` 之后；
  `ctype = 1` 表示 Snappy。
- Chromium Local Storage 的字符串多为 UTF-16，且可能整体偏移 1 字节；
  `LevelDB.decode()` 会对 `offset × endian` 四种组合解码并挑最干净的结果。
- 数据来源是前端 react-query 缓存：`useRequestCache:playlist_detail:<歌单ID>`，
  曲目在 `data.media_resources[].entity.track_wrapper.track`。
- 只导出 owner 与本机登录 UID 一致的歌单，避免把别人主页的数据也混进来。

## 部署

整站是静态文件，丢到任意静态托管（GitHub Pages / Vercel / OSS）即可，无需后端。
