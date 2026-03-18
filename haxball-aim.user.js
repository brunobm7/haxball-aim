// ==UserScript==
// @name         HaxBall Aim Assist
// @namespace    https://github.com/brunobm7/haxball-aim
// @version      1.4
// @description  Mira de trajetória em tempo real para HaxBall — overlay com calibração por clique
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

  // Injeta o script assim que o documento estiver pronto
  function injectCore(code) {
    const script = document.createElement('script');
    script.textContent = code;
    // Tentar injetar no head ou documentElement
    const target = document.head || document.documentElement || document.body;
    if (target) {
      target.appendChild(script);
    } else {
      // Se ainda não há DOM, aguardar
      document.addEventListener('DOMContentLoaded', () => {
        (document.head || document.documentElement).appendChild(script);
      });
    }
  }

  // Buscar o core do GitHub e injetar
  GM_xmlhttpRequest({
    method: 'GET',
    url: CORE_URL + '?t=' + Date.now(), // cache-bust
    onload: function (response) {
      if (response.status === 200) {
        injectCore(response.responseText);
        console.log('[HaxAim] Core carregado do GitHub ✅');
      } else {
        console.error('[HaxAim] Falha ao carregar core:', response.status);
      }
    },
    onerror: function (err) {
      console.error('[HaxAim] Erro de rede ao carregar core:', err);
    }
  });

})();
