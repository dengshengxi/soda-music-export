# -*- coding: utf-8 -*-
"""一次性改官网 site/index.html：宣传文案升级为「汽水 ↔ QQ 音乐 双向」，并纠正那条已过时的 FAQ"""
import re, sys

p = 'site/index.html'
s = open(p, encoding='utf-8').read()
orig = s


def rep(old, new, label):
    global s
    if old not in s:
        print('✗ 没找到：' + label)
        return False
    s = s.replace(old, new, 1)
    print('✓ ' + label)
    return True


# 1. hero 主标题
rep('<h1>把汽水音乐的收藏，<br><em>整整齐齐搬进 QQ 音乐</em></h1>',
    '<h1>汽水音乐 ↔ QQ 音乐，<br><em>歌单两个方向都能搬</em></h1>',
    'hero 主标题')

# 2. hero 副标题（跨行，用正则整体替换）
s2, n = re.subn(r'<p class="lead">[\s\S]*?</p>',
                '<p class="lead">汽水音乐的收藏能导出成可粘贴的清单搬去 QQ 音乐；'
                '反过来，QQ 音乐里的歌单和「我喜欢的音乐」也能一键抓出来。'
                '两个方向都在浏览器里完成，不用装东西、不上传任何数据。</p>',
                s, count=1)
if n:
    print('✓ hero 副标题')
    s = s2
else:
    print('✗ 没找到 hero 副标题')

# 3. hero 徽章
rep('<span class="badge">🙅 无需登录音乐账号</span>',
    '<span class="badge">🙅 无需登录音乐账号</span>\n      <span class="badge">🔄 双向都支持</span>',
    'hero 徽章')

# 4. hero 主 CTA 后面加一个 QQ 音乐入口
rep('      <a class="btn lg ghost" href="help.html">先看使用说明</a>',
    '      <a class="btn lg ghost" href="https://qq48gy6vpn88r.cave.functorz-app.com/qqmusic.html">导出 QQ 音乐歌单 →</a>\n'
    '      <a class="btn lg ghost" href="help.html">先看使用说明</a>',
    'hero CTA')

# 5. 功能区标题下的导语
rep('<p>音乐 App 之间没有互通的歌单迁移通道，但你的收藏本来就躺在自己硬盘里 —— 它只是被锁在了一个没人看得懂的数据库文件里。</p>',
    '<p>音乐 App 之间没有互通的歌单迁移通道，但你要的东西本来就在自己这台电脑上 —— '
    '要么躺在硬盘里一个没人看得懂的数据库文件中，要么就在你已经登录的网页里。两个方向，各自对应一套办法。</p>',
    '功能区导语')

# 6. 功能网格：加一张「QQ 音乐也能反过来导出」的卡
rep('      <div class="card feat"><div class="ico">🔍</div><h3>可自查，不含糊</h3>',
    '      <div class="card feat"><div class="ico">🔄</div><h3>QQ 音乐也能反过来导出</h3>\n'
    '        <p>在 QQ 音乐网页版点一下书签，就能把任意歌单和「我喜欢的音乐」抓出来 —— '
    '包括你自己收藏的别人的歌单。不用算签名、不调私有接口，靠读取页面已经收到的数据。</p></div>\n'
    '      <div class="card feat"><div class="ico">🔍</div><h3>可自查，不含糊</h3>',
    '新增 QQ 导出功能卡')

# 7. 纠正那条已经过时的 FAQ —— 现在是能做的
old_faq = re.search(r'      <details class="q"><summary>能反过来导出 QQ 音乐的歌单吗\?</summary>[\s\S]*?</details>', s)
if old_faq:
    s = s.replace(old_faq.group(0), (
        '      <details class="q"><summary>能反过来导出 QQ 音乐的歌单吗？</summary><div class="a">\n'
        '        <p><b>能。</b>在工具站切换到「QQ 音乐导出」，把页面上的小书签拖到浏览器书签栏；\n'
        '        之后在 QQ 音乐网页版打开任意歌单、点一下那个书签，右上角就会出现计数面板，直接复制即可。</p>\n'
        '        <p>注意：它需要你在自己平时用的浏览器里登录 y.qq.com —— 网页数量比你想象的更全，\n'
        '        「我喜欢的音乐」和收藏的别人歌单都一样能导。</p>\n'
        '      </div></details>'), 1)
    print('✓ 纠正 QQ 音乐反向导出 FAQ')
else:
    print('✗ 没找到 QQ 音乐反向导出 FAQ')

# 8. 再补一条新 FAQ：为什么 QQ 音乐要拖书签
rep('      <details class="q"><summary>需要付费吗？</summary><div class="a">',
    '      <details class="q"><summary>为什么 QQ 音乐导出要拖书签？不能直接点开就用吗？</summary><div class="a">\n'
    '        <p>浏览器不允许别的网站去读 QQ 音乐的登录数据（跨域限制），所以必须在你已经打开的 QQ 音乐页面上运行。\n'
    '        书签是解决这个问题最方便的办法 —— 拖一次，以后在那边点一下就行。这也正是它最安全的原因：数据始终没离开你的浏览器。</p>\n'
    '      </div></details>\n'
    '      <details class="q"><summary>需要付费吗？</summary><div class="a">',
    '新增书签说明 FAQ')

if s == orig:
    print('\n没有任何改动，检查锚点是否变了')
    sys.exit(1)

open(p, 'w', encoding='utf-8').write(s)
print('\n已写入', p, len(s), '字节')
