// ==UserScript==
// @name         HaxBall Aim Assist
// @namespace    https://github.com/brunobm7/haxball-aim
// @version      1.5
// @description  Mira de trajetória em tempo real para HaxBall
// @author       brunobm7
// @match        https://www.haxball.com/*
// @match        https://*.haxball.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/brunobm7/haxball-aim/main/haxball-aim.user.js
// @downloadURL  https://raw.githubusercontent.com/brunobm7/haxball-aim/main/haxball-aim.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CORE_URL = 'https://raw.githubusercontent.com/brunobm7/haxball-aim/main/aim-core.js';
  let coreCode = null;
  let injectedDocs = new WeakSet();

  function fetchCore(callback) {
    if (coreCode) { callback(coreCode); return; }
    GM_xmlhttpRequest({
      method: 'GET',
      url: CORE_URL + '?t=' + Date.now(),
      onload: function (r) {
        if (r.status === 200) {
          coreCode = r.responseText;
          console.log('[HaxAim] Core baixado ✅');
          callback(coreCode);
        } else {
          console.error('[HaxAim] Erro ao baixar core:', r.status);
        }
      },
      onerror: function (e) { console.error('[HaxAim] Erro de rede:', e); }
    });
  }

  function injectIntoDoc(doc, code) {
    if (!doc || injectedDocs.has(doc)) return;
    try {
      injectedDocs.add(doc);
      const s = doc.createElement('script');
      s.textContent = code;
      const target = doc.head || doc.documentElement || doc.body;
      if (target) {
        target.appendChild(s);
        console.log('[HaxAim] ✅ Injetado em:', doc.location ? doc.location.href : '(desconhecido)');
      }
    } catch(e) {
      console.warn('[HaxAim] Falha injeção:', e.message);
    }
  }

  function tryInjectEverywhere(code) {
    // Documento atual
    injectIntoDoc(document, code);

    // Todos os iframes acessíveis
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(f => {
        try {
          const d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
          if (d) injectIntoDoc(d, code);
        } catch(e) {}
      });
    } catch(e) {}

    // window.frames
    try {
      for (let i = 0; i < window.frames.length; i++) {
        try { injectIntoDoc(window.frames[i].document, code); } catch(e) {}
      }
    } catch(e) {}
  }

  function startWatching(code) {
    // Injetar imediatamente
    tryInjectEverywhere(code);

    // Observar novos elementos (iframes carregando o jogo)
    new MutationObserver(() => tryInjectEverywhere(code))
      .observe(document.documentElement, { childList: true, subtree: true });

    // Tentar em intervalos (jogo pode demorar para carregar)
    const retries = [500, 1500, 3000, 5000, 8000];
    retries.forEach(delay => setTimeout(() => tryInjectEverywhere(code), delay));
  }

  // Iniciar
  fetchCore(function(code) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => startWatching(code));
    } else {
      startWatching(code);
    }
  });

})();
