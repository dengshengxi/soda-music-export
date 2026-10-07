/* 汽水收藏导出 —— 本地账号模块
 *
 * 说明：这是一个「纯本地」账号实现，账号数据只保存在当前浏览器的 localStorage 里。
 * 它提供的是本机范围内的登录态和偏好同步，不是跨设备的云端账号。
 * 密码不会以明文保存：随机 salt + SHA-256（不支持 SubtleCrypto 时降级为 FNV-1a）。
 */
(function (global) {
  'use strict';

  var K_ACCOUNTS = 'soda_export_accounts';   // { users: { name: {salt, hash, createdAt} } }
  var K_SESSION  = 'soda_export_session';    // { user, since }
  var K_PREFS    = 'soda_export_prefs';      // { userName: {...} }
  var listeners = [];

  /* ---------- 存储 ---------- */
  function read(key, dflt) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : dflt; }
    catch (e) { return dflt; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  /* ---------- 工具 ---------- */
  function rand(n) {
    var a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', s = '';
    for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function fnv(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function hash(pw, salt) {
    var raw = salt + '::' + pw;
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      try {
        return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
          .then(function (buf) {
            var hex = Array.prototype.map.call(new Uint8Array(buf), function (x) {
              return ('0' + x.toString(16)).slice(-2);
            }).join('');
            return 'sha256$' + hex;
          })
          .catch(function () { return Promise.resolve('fnv$' + fnv(raw)); });
      } catch (e) { /* 落到下面 */ }
    }
    return Promise.resolve('fnv$' + fnv(raw));
  }
  function emit() { listeners.forEach(function (f) { try { f(Auth.me()); } catch (e) {} }); }

  /* ---------- 校验 ---------- */
  function checkUser(u) {
    u = String(u || '').trim();
    if (u.length < 2 || u.length > 20) return '昵称要 2–20 个字符';
    if (/[\s@#\/\\]/.test(u)) return '昵称不能包含空格或 @ # / \\ 这些符号';
    return '';
  }
  function checkPass(p) {
    p = String(p || '');
    if (p.length < 6) return '密码至少 6 位';
    if (p.length > 64) return '密码太长了';
    return '';
  }

  var Auth = {
    /* 注册 */
    signUp: function (user, pass) {
      user = String(user || '').trim();
      var e = checkUser(user) || checkPass(pass);
      if (e) return Promise.resolve({ ok: false, error: e });
      var db = read(K_ACCOUNTS, { users: {} });
      db.users = db.users || {};
      if (db.users[user]) return Promise.resolve({ ok: false, error: '这个昵称已经被占用了' });
      var salt = rand(16);
      return hash(pass, salt).then(function (h) {
        db.users[user] = { salt: salt, hash: h, createdAt: Date.now() };
        write(K_ACCOUNTS, db);
        write(K_SESSION, { user: user, since: Date.now() });
        emit();
        return { ok: true, user: user };
      });
    },

    /* 登录 */
    signIn: function (user, pass) {
      user = String(user || '').trim();
      var e = checkUser(user) || checkPass(pass);
      if (e) return Promise.resolve({ ok: false, error: e });
      var db = read(K_ACCOUNTS, { users: {} });
      var rec = (db.users || {})[user];
      if (!rec) return Promise.resolve({ ok: false, error: '没有找到这个账号，先注册一个吧' });
      return hash(pass, rec.salt).then(function (h) {
        if (h !== rec.hash) return { ok: false, error: '密码不对' };
        write(K_SESSION, { user: user, since: Date.now() });
        emit();
        return { ok: true, user: user };
      });
    },

    signOut: function () {
      try { localStorage.removeItem(K_SESSION); } catch (e) {}
      emit();
    },

    me: function () {
      var s = read(K_SESSION, null);
      if (!s || !s.user) return null;
      var db = read(K_ACCOUNTS, { users: {} });
      if (!(db.users || {})[s.user]) return null;
      return { name: s.user, since: s.since };
    },

    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },

    /* 每个账号的导出偏好 */
    prefs: function (user) {
      var all = read(K_PREFS, {});
      user = user || (Auth.me() || {}).name;
      return (user && all[user]) || null;
    },
    savePrefs: function (obj) {
      var m = Auth.me();
      if (!m) return false;
      var all = read(K_PREFS, {});
      all[m.name] = obj;
      return write(K_PREFS, all);
    },

    /* 本机已有账号数量（用于界面提示） */
    count: function () {
      var db = read(K_ACCOUNTS, { users: {} });
      return Object.keys(db.users || {}).length;
    },

    validate: { user: checkUser, pass: checkPass }
  };

  global.Auth = Auth;
})(window);
