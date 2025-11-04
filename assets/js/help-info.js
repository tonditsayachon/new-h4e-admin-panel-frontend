/* global jQuery */
(function ($) {
  // ==============================
  // CONFIG
  // ==============================
  var USE_QUERY_MODE = false;                 // true: ใช้หน้าเดียว + ?topic=..., false: map เป็นไฟล์แยกใน switch
 
  // ใช้เมื่อ USE_QUERY_MODE = true
  // var HELP_BASE = '/help/index.html';       
  var PANEL_ID = 'help-overlay';
  var IFRAME_ID = 'help-iframe';
  var CLOSE_BTN_SEL = '.help-close';
  var TRIGGER_SEL = '.info-pop';

  // ถ้าบางปุ่มอยาก override URL เอง ให้ใช้ data-help-url บน <a>
  // <a class="info-pop" data-help-topic="x" data-help-url="/help/custom.html">…

  // ==============================
  // INTERNAL STATE
  // ==============================
  var lastOpener = null; // element ที่กดเปิดล่าสุด (เอาไว้คืนโฟกัสตอนปิด)
  var $overlay = null;
  var $iframe = null;

  // ==============================
  // DOM TEMPLATES
  // ==============================
  function ensureOverlay() {
    if ($('#' + PANEL_ID).length) {
      $overlay = $('#' + PANEL_ID);
      $iframe = $('#' + IFRAME_ID);
      return;
    }

    var html =
      '<div id="' + PANEL_ID + '" hidden>' +
      '  <div class="help-modal" role="dialog" aria-modal="true" aria-label="Help dialog">' +
      '    <button type="button" class="help-close" aria-label="Close help">×</button>' +
      '    <iframe id="' + IFRAME_ID + '" src="about:blank" frameborder="0"></iframe>' +
      '  </div>' +
      '</div>';

    $('body').append(html);
    $overlay = $('#' + PANEL_ID);
    $iframe = $('#' + IFRAME_ID);

    // ปิดเมื่อกดปุ่มปิด
    $(document).on('click', CLOSE_BTN_SEL, function (e) {
      e.preventDefault();
      closeHelp();
    });

    // ปิดเมื่อคลิกที่พื้นหลัง (นอก .help-modal)
    $(document).on('click', '#' + PANEL_ID, function (e) {
      if (e.target.id === PANEL_ID) closeHelp();
    });

    // ปิดด้วย Escape
    $(document).on('keydown.help-overlay', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeHelp();
      }
    });

    // Focus trap: วนโฟกัสภายใน dialog
    $(document).on('keydown.help-trap', function (e) {
      if ($overlay[0].hidden) return; // if closed, ignore
      if (e.key !== 'Tab') return;

      var $focusables = getFocusableIn($overlay.find('.help-modal')[0]);
      if (!$focusables.length) return;

      var first = $focusables[0];
      var last = $focusables[$focusables.length - 1];
      var active = document.activeElement;

      if (e.shiftKey) {
        if (active === first) { // Shift+Tab บนตัวแรก → โฟกัสตัวท้าย
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) { // Tab บนตัวท้าย → โฟกัสตัวแรก
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // คืนลิสต์ element ที่โฟกัสได้
  function getFocusableIn(root) {
    var selectors = [
      'a[href]:not([tabindex="-1"])',
      'area[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      'iframe:not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]:not([tabindex="-1"])'
    ].join(',');

    var nodes = Array.prototype.slice.call(root.querySelectorAll(selectors));
    // กรอง element ที่มองไม่เห็นจริง ๆ
    nodes = nodes.filter(function (el) {
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    });
    return nodes;
  }

  // ทำ inert + aria-hidden ให้ "พื้นหลัง" (ทุก sibling ของ overlay)
  function setBackgroundInert(enable) {
    var overlayEl = document.getElementById(PANEL_ID);
    if (!overlayEl) return;

    // siblings ของ overlay
    var siblings = Array.prototype.filter.call(
      overlayEl.parentNode.children,
      function (el) { return el !== overlayEl; }
    );

    siblings.forEach(function (el) {
      if (enable) {
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
      } else {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      }
    });
  }

  // map topic → URL
  function mapTopicToUrl(topic) {
    var t = (topic || '').toString().trim().toLowerCase().replace(/\s+/g, '-');

    if (USE_QUERY_MODE) {
      // หน้าเดียว + query parameter
      return HELP_BASE + '?topic=' + encodeURIComponent(t || 'help');
    }

    // โหมดไฟล์แยก
    switch (t) {
      case 'h-number':
        return '/info/h-number-info.html';
      case 'additive-cate':
        return '/info/additive-cate-info.html';
      case 'halal-additive-cate':
        return '/info/halal-add-cate.html';
      case 'guarantee':
        return '/info/guarantee-info.html';
      case 'distributors-info':
        return '/info/distributors-info.html';
      default:
        return '/info/default.html';
    }
  }

  // เปิด dialog + โหลด URL เข้า iframe
  function openHelp(url, openerEl) {
    ensureOverlay();
    lastOpener = openerEl || null;

    // แสดง overlay (อย่าใช้ aria-hidden กับ dialog)
    $overlay[0].hidden = false;
    $('body').addClass('help-open');

    // กันพื้นหลัง
    setBackgroundInert(true);

    // ตั้ง src
    $iframe.attr('src', url);

    // โฟกัสปุ่มปิด (หรือ element โฟกัสแรก)
    var $close = $overlay.find('.help-close');
    if ($close.length) {
      $close[0].focus();
    } else {
      var focusables = getFocusableIn($overlay.find('.help-modal')[0]);
      if (focusables.length) focusables[0].focus();
    }

    // เปิด transition class (สำหรับ animation ถ้าใช้)
    requestAnimationFrame(function () {
      $overlay.addClass('is-open');
    });
  }

  // ปิด dialog
  function closeHelp() {
    if (!$overlay || $overlay[0].hidden) return;

    // เอา transition class ออกก่อน
    $overlay.removeClass('is-open');

    // คืนโฟกัสให้ opener ก่อนซ่อน dialog
    if (lastOpener && document.contains(lastOpener)) {
      $(lastOpener).focus();
    } else if (document.activeElement) {
      document.activeElement.blur();
    }

    // ปลด inert พื้นหลัง
    setBackgroundInert(false);

    // ซ่อน overlay + ล้างสถานะ
    $overlay[0].hidden = true;
    $('body').removeClass('help-open');
    // ถ้าต้องการลดโหลด สามารถเคลียร์ src:
    // $iframe.attr('src', 'about:blank');
  }

  // คลิกตัวเปิด
  $(document).on('click', TRIGGER_SEL, function (e) {
    e.preventDefault();

    var $btn = $(this);
    var topic = $btn.data('help-topic');
    var overrideUrl = $btn.data('help-url');
    var helpUrl = overrideUrl ? String(overrideUrl) : mapTopicToUrl(topic);

    openHelp(helpUrl, this);
  });

  // export ถ้าจำเป็น
  window.AppHelp = {
    open: openHelp,
    close: closeHelp,
    mapTopicToUrl: mapTopicToUrl,
    config: function (cfg) {
      if (typeof cfg.USE_QUERY_MODE === 'boolean') USE_QUERY_MODE = cfg.USE_QUERY_MODE;
      if (typeof cfg.HELP_BASE === 'string') HELP_BASE = cfg.HELP_BASE;
    }
  };
})(jQuery);
