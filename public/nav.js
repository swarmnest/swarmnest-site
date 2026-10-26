/* Swarmnest header: mobile Menu sheet and desktop Directory panel. Keyboard friendly: Esc closes, focus returns to the button. */
(function () {
  function setup(btn, panel, opts) {
    if (!btn || !panel) return null;
    var other = null;
    function focusables() { return panel.querySelectorAll('a[href],button,input,select,textarea'); }
    function open() {
      if (other && other.isOpen()) other.close(false);
      panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
      if (opts.lock) document.documentElement.classList.add('menu-open');
      if (opts.focusFirst) { var f = focusables(); if (f.length) f[0].focus(); }
    }
    function close(refocus) {
      if (panel.hidden) return;
      panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
      if (opts.lock) document.documentElement.classList.remove('menu-open');
      if (refocus !== false) btn.focus();
    }
    function isOpen() { return !panel.hidden; }
    btn.addEventListener('click', function (e) { e.stopPropagation(); isOpen() ? close() : open(); });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab' && !opts.trap) {
        // Panel sits after the nav in the DOM: Shift+Tab from its first link returns to the button, Tab past its last link closes it and moves on.
        var g = focusables(); if (!g.length) return;
        if (e.shiftKey && document.activeElement === g[0]) { e.preventDefault(); btn.focus(); }
        else if (!e.shiftKey && document.activeElement === g[g.length - 1]) { var nx = btn.nextElementSibling; while (nx && nx.offsetParent === null) nx = nx.nextElementSibling; if (nx) { e.preventDefault(); close(false); nx.focus(); } else close(false); }
        return;
      }
      if (e.key === 'Tab' && opts.trap) {
        var f = focusables(); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); }
      else if (e.key === 'Tab' && !e.shiftKey && !opts.trap && isOpen()) { var f = focusables(); if (f.length) { e.preventDefault(); f[0].focus(); } }
    });
    function contains(el) { return el === btn || panel.contains(el); }
    document.addEventListener('click', function (e) { if (isOpen() && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(false); });
    return { open: open, close: close, isOpen: isOpen, contains: contains, pair: function (o) { other = o; } };
  }
  var menu = setup(document.getElementById('menu-btn'), document.getElementById('mmenu'), { focusFirst: true, trap: true, lock: true });
  var dir = setup(document.getElementById('dir-btn'), document.getElementById('dpanel'), { focusFirst: false, trap: false, lock: false });
  if (menu && dir) { menu.pair(dir); dir.pair(menu); }
  var mc = document.getElementById('mm-close'); if (mc && menu) mc.addEventListener('click', function () { menu.close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (menu && menu.isOpen()) menu.close(); if (dir && dir.isOpen()) dir.close(dir.contains(document.activeElement) ? undefined : false); } });
  // Close the mobile sheet if the screen grows to desktop width.
  var mq = window.matchMedia('(min-width: 820px)');
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function (m) { if (m.matches && menu && menu.isOpen()) menu.close(false); });
})();
