# -*- coding: utf-8 -*-
"""给两份帮助文档补上「QQ 音乐导出」章节，并把文案升级为覆盖双向"""
import re, sys

NEW_SECTION = '''
<section class="card" id="qq">
  <h2><span class="n">9</span>另一条路：导出 QQ 音乐里的歌单</h2>
  <p>前面讲的都是从<b>汽水音乐</b>往外搬。反过来也行 —— 把你在 QQ 音乐里的歌单和「我喜欢的音乐」抓出来。
  不过用的办法完全不同，因为 QQ 音乐的 PC 客户端是<b>原生程序</b>，它的本地歌单库是加密的，读不了；
  能走通的是<b>网页版</b>：在浏览器里登录 <code>y.qq.com</code>，然后用一个小书签抓取。</p>

  <h3>装一次（30 秒）</h3>
  <ol class="steps">
    <li><b>用你自己的 Edge / Chrome 打开 <code>https://y.qq.com</code> 并登录</b>（一般扫码即可）。
      这里说的就是你平时用的浏览器，不需要任何额外的窗口或软件。</li>
    <li><b>把小书签拖到书签栏</b>：打开工具站，切到「🎵 QQ 音乐导出」，页面上有个绿色按钮
      <b>「⭐ QQ音乐歌单导出」</b> —— 按住它拖到地址栏下面那排书签里松手。</li>
    <li><b>打开你要导出的歌单</b>，比如左侧的「我喜欢的音乐」，或者任意一个歌单。
      <b>往下滚动，让它加载完</b>（它是一屏一屏加载的）。</li>
    <li><b>点一下书签栏里那个 ⭐</b> —— 右上角会出现一个小面板，显示「已捕获 N 首」。</li>
  </ol>

  <h3>怎么用那个面板</h3>
  <ul>
    <li><b>复制</b> —— 复制成「歌名 - 歌手」的纯文本，一行一首，和汽水那边的格式完全一样。</li>
    <li><b>TXT / CSV / JSON</b> —— 下载成文件，其中 CSV 带 BOM，Excel 打开不乱码。</li>
    <li><b>重新清空</b> —— 换歌单之前点它，不然几个歌单会串在一起。</li>
    <li>面板右上角的 <b>×</b> 只是收起来。想再叫出来，重新点一次书签就行。</li>
  </ul>

  <h3>书签拖不动？试试粘贴</h3>
  <p>在 QQ 音乐歌单页面按 <kbd>F12</kbd> 打开控制台（Console），把工具站上「复制脚本」按钮复制下来的代码粘进去，回车 —— 效果和书签一模一样。</p>
  <div class="callout c-warn">
    <b>控制台不让粘贴？</b>Chrome / Edge 会弹红字提示防范诈骗。在那个输入框里先敲 <code>allow pasting</code> 回车，
    再重新粘一次。<b>这是浏览器自带的安全机制，不是脚本有问题。</b>
  </div>

  <div class="callout c-info">
    <b>每次刷新网页后要重新点一次书签</b>（或重新粘一次代码）。因为抓取是挂在当时那个页面上的，刷新会把它清掉 —— 这也正是它用完就走、不留后门的原因。
  </div>

  <h3>能抓哪些？</h3>
  <table>
    <tr><th style="width:170px">内容</th><th>能不能导</th></tr>
    <tr><td>我喜欢的音乐</td><td>✅ 打开那个页面即可</td></tr>
    <tr><td>自己创建的歌单</td><td>✅ 打开即可</td></tr>
    <tr><td>收藏的别人的歌单</td><td>✅ 只要你能打开看到歌曲</td></tr>
    <tr><td>QQ 音乐 PC 客户端里的数据</td><td>❌ 本地歌单库是加密的，网页版才是正确入口</td></tr>
  </table>

  <h3>常见问题</h3>
  <div class="callout c-warn">
    <b>显示 0 首？</b>先确认页面上的歌真的显示出来了。然后在页面上随便点一下、往下滚一点，再点 ⭐ ——
    它是靠"页面自己收到的响应"记账的，页面没加载它就记不到。
  </div>
  <div class="callout c-warn">
    <b>数量比歌单里少？</b>没滚到底。往下再滚一批就多加载一批，面板数字会跟着涨，涨到不动就是全了。
  </div>
  <div class="callout c-info">
    <b>为什么不做成一个网址直接跑？</b>浏览器不允许别的网站去读 QQ 音乐的登录数据（跨域限制），所以必须在你已经打开的 QQ 音乐页面上跑。
    顺带这成了它最安全的一点：数据从头到尾没离开你的浏览器。
  </div>
</section>
'''


def patch(path, home_label):
    s = open(path, encoding='utf-8').read()
    o = s

    def rep(old, new, label):
        nonlocal s
        if old in s:
            s = s.replace(old, new, 1)
            print('  ✓ ' + label)
        else:
            print('  ✗ 没找到：' + label)

    print(path)
    rep('<title>使用帮助 · 汽水音乐收藏导出</title>',
         '<title>使用帮助 · 汽水音乐 ↔ QQ 音乐 歌单导出</title>', 'title')

    rep('<p class="lead">把你汽水音乐里的收藏歌曲，导出成能直接粘进 QQ 音乐的清单。全程在你自己电脑的浏览器里完成，不上传、不联网。</p>',
        '<p class="lead">两个方向都讲：<b>汽水音乐 → 导出成清单</b>，以及<b>反过来从 QQ 音乐里抓歌单</b>。'
        '全程都在你自己电脑的浏览器里完成，不上传、不联网。</p>', 'lead')

    rep('    <a href="#quick">三步上手</a>',
        '    <a href="#qq">QQ 音乐导出</a>\n    <a href="#quick">三步上手</a>', '顶部导航')

    rep('  <a href="#before">开始之前</a>',
        '  <a href="#qq">另一条路：导出 QQ 音乐的歌单</a>\n  <a href="#before">开始之前</a>', '侧栏目录')

    # 隐私那一节原本是 9，改成 10，把 9 让给 QQ 章节
    rep('<span class="n">9</span>隐私与安全', '<span class="n">10</span>隐私与安全', '隐私节编号 9→10')

    if '</main>' in s:
        s = s.replace('</main>', NEW_SECTION + '\n</main>', 1)
        print('  ✓ 已插入 QQ 音乐导出章节')
    else:
        print('  ✗ 找不到 </main>')

    if s == o:
        print('  ⚠ 没有任何改动')
        return
    open(path, 'w', encoding='utf-8').write(s)
    print('  已写入', len(s), '字节')


patch('website/help.html', 'index.html')
patch('site/help.html', 'https://qq48gy6vpn88r.villa.functorz-app.com')
