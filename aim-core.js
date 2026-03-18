/**
 * HaxBall Aim Assist — aim-core.js
 * Hospedado em: https://raw.githubusercontent.com/brunobm7/haxball-aim/main/aim-core.js
 *
 * Injetado via Tampermonkey no frame do jogo (game.html)
 * Compatível com HaxBall 2025/2026
 */
(function () {
  'use strict';

  // ── Configurações ─────────────────────────────────────────────────────────
  const CFG = {
    enabled: true,
    color: '#00ff88',
    opacity: 0.82,
    lineWidth: 2.5,
    arrowLength: 180,
    contactRadius: 20,
    dashSegments: [12, 6],
    showDot: true,
    showArrowHead: true,
    glowEffect: true,
    predictionSteps: 5,
    ballRadiusMin: 6,
    ballRadiusMax: 12,
    playerRadiusMin: 13,
    playerRadiusMax: 30,
  };

  let gameCanvas = null, overlayCanvas = null, overlayCtx = null;
  let frameCircles = [], rafId = null, patchInterval = null;
  let liveSnapshot = [];

  const calib = {
    active: false,
    step: null,
    playerSample: null,
    ballSample: null,
    crosshair: null,
  };

  const state = {
    player: { x: 0, y: 0, r: 0, valid: false },
    ball:   { x: 0, y: 0, r: 0, valid: false },
    inContact: false, angle: 0, ballVelX: 0, ballVelY: 0,
  };

  const dist = (ax, ay, bx, by) => Math.sqrt((bx-ax)**2 + (by-ay)**2);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── Canvas ────────────────────────────────────────────────────────────────
  function findGameCanvas() {
    return [...document.querySelectorAll('canvas')]
      .sort((a,b) => (b.width*b.height) - (a.width*a.height))
      .find(c => c.width >= 300 && c.height >= 200) || null;
  }

  function patchCanvasContext(ctx) {
    if (ctx.__haxAimPatched) return true;
    ctx.__haxAimPatched = true;
    const orig = ctx.arc.bind(ctx);
    ctx.arc = function(x, y, r, s, e, a) {
      if (r >= 4 && r <= 35) frameCircles.push({ x, y, r });
      return orig(x, y, r, s, e, a);
    };
    console.log('[HaxAim] ✅ arc() patcheado');
    return true;
  }

  function overlayToCanvas(clientX, clientY) {
    const rect = overlayCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (gameCanvas.width  / rect.width),
      y: (clientY - rect.top)  * (gameCanvas.height / rect.height),
    };
  }

  function findNearestCircle(cx, cy, circles) {
    if (!circles.length) return null;
    return circles.reduce((best, c) =>
      dist(c.x,c.y,cx,cy) < dist(best.x,best.y,cx,cy) ? c : best, circles[0]);
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  function createOverlay(canvas) {
    if (overlayCanvas) overlayCanvas.remove();

    overlayCanvas = document.createElement('canvas');
    overlayCanvas.width  = canvas.width;
    overlayCanvas.height = canvas.height;
    overlayCanvas.style.cssText = [
      'position:absolute','top:0','left:0',
      'width:'  + (canvas.offsetWidth  || canvas.width)  + 'px',
      'height:' + (canvas.offsetHeight || canvas.height) + 'px',
      'pointer-events:none','z-index:99999'
    ].join(';');

    const parent = canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');

    try { patchCanvasContext(canvas.getContext('2d')); } catch(e) {}

    if (patchInterval) clearInterval(patchInterval);
    patchInterval = setInterval(() => {
      try {
        if (patchCanvasContext(canvas.getContext('2d'))) {
          clearInterval(patchInterval);
          patchInterval = null;
        }
      } catch(e) {}
    }, 200);

    new ResizeObserver(() => {
      if (!overlayCanvas || !canvas) return;
      overlayCanvas.style.width  = (canvas.offsetWidth  || canvas.width)  + 'px';
      overlayCanvas.style.height = (canvas.offsetHeight || canvas.height) + 'px';
      overlayCanvas.width  = canvas.width;
      overlayCanvas.height = canvas.height;
    }).observe(canvas);

    document.addEventListener('click',     onDocClick,     true);
    document.addEventListener('mousemove', onDocMouseMove, true);
  }

  // ── Calibração ────────────────────────────────────────────────────────────
  function onDocMouseMove(e) {
    if (!calib.active || !calib.step || !overlayCanvas) return;
    calib.crosshair = overlayToCanvas(e.clientX, e.clientY);
  }

  function onDocClick(e) {
    if (!calib.active || !calib.step || !overlayCanvas) return;

    const rect = gameCanvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) return;

    e.stopPropagation();
    e.preventDefault();

    const pos     = overlayToCanvas(e.clientX, e.clientY);
    const nearest = findNearestCircle(pos.x, pos.y, liveSnapshot);

    if (!nearest) {
      showToast('⚠️ Nenhum objeto detectado. Clique mais perto.');
      return;
    }

    if (calib.step === 'player') {
      calib.playerSample  = nearest;
      CFG.playerRadiusMin = Math.max(4,  nearest.r - 4);
      CFG.playerRadiusMax = Math.min(50, nearest.r + 4);
      showToast('✅ Jogador marcado! r=' + nearest.r.toFixed(1) + ' — Agora marque a bola');
      setCalibStep('ball');
    } else if (calib.step === 'ball') {
      calib.ballSample  = nearest;
      CFG.ballRadiusMin = Math.max(2,  nearest.r - 3);
      CFG.ballRadiusMax = Math.min(20, nearest.r + 3);
      showToast('✅ Bola marcada! r=' + nearest.r.toFixed(1) + ' — Calibração concluída!');
      saveConfig();
      setCalibStep(null);
      calib.active = false;
      updateCalibPanel();
    }
  }

  function setCalibStep(step) {
    calib.step      = step;
    calib.crosshair = null;
    if (overlayCanvas) overlayCanvas.style.pointerEvents = step ? 'auto' : 'none';
    updateCalibPanel();
  }

  // ── Painel ────────────────────────────────────────────────────────────────
  let calibPanel = null;

  function createCalibPanel() {
    if (calibPanel) return;
    calibPanel = document.createElement('div');
    calibPanel.style.cssText = `
      position:fixed; top:16px; right:16px;
      background:rgba(10,12,18,0.96);
      border:1px solid rgba(0,255,136,0.25);
      border-radius:12px; padding:14px 16px;
      z-index:999999; font-family:'Segoe UI',sans-serif;
      font-size:13px; color:#e8eaf0; width:224px;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      user-select:none;
    `;
    document.body.appendChild(calibPanel);
    updateCalibPanel();
  }

  function btnStyle(active, danger, small) {
    const bg     = danger ? 'rgba(255,77,109,0.15)' : active ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)';
    const border = danger ? 'rgba(255,77,109,0.4)'  : active ? 'rgba(0,255,136,0.5)'  : 'rgba(255,255,255,0.1)';
    const color  = danger ? '#ff4d6d' : active ? '#00ff88' : '#e8eaf0';
    return `background:${bg};border:1px solid ${border};color:${color};
      border-radius:7px;padding:${small?'4px 10px':'7px 10px'};
      font-size:${small?'11':'12'}px;cursor:pointer;text-align:left;
      font-family:'Segoe UI',sans-serif;width:100%;display:block;margin-bottom:6px;
      ${active ? 'box-shadow:0 0 8px rgba(0,255,136,0.2);' : ''}`;
  }

  function updateCalibPanel() {
    if (!calibPanel) return;
    const pDone = !!calib.playerSample;
    const bDone = !!calib.ballSample;

    const instruction = calib.active
      ? (calib.step === 'player'
          ? '👆 Clique sobre <b style="color:#00c8ff">seu jogador</b> no jogo'
          : calib.step === 'ball'
          ? '👆 Clique sobre <b style="color:#ffd600">a bola</b> no jogo'
          : '✅ Calibração concluída')
      : 'Pressione <b style="color:#fff">C</b> ou clique abaixo';

    calibPanel.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:8px;
        background:linear-gradient(90deg,#00ff88,#00c8ff);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;">
        🎯 Aim Assist
      </div>
      <div style="margin-bottom:10px;font-size:11px;color:#8892a4;line-height:1.4;">
        ${instruction}
      </div>
      <button id="hx-p" style="${btnStyle(calib.step==='player')}">
        ${pDone?'✅':'⬜'} Marcar Jogador
        ${calib.playerSample ? '<span style="color:#00c8ff;font-size:10px;float:right">r='+calib.playerSample.r.toFixed(1)+'</span>' : ''}
      </button>
      <button id="hx-b" style="${btnStyle(calib.step==='ball')}">
        ${bDone?'✅':'⬜'} Marcar Bola
        ${calib.ballSample ? '<span style="color:#ffd600;font-size:10px;float:right">r='+calib.ballSample.r.toFixed(1)+'</span>' : ''}
      </button>
      <button id="hx-r" style="${btnStyle(false,true)}">🔄 Resetar Calibração</button>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
        <span style="font-size:11px;color:#6b7280;">Mira (tecla M)</span>
        <button id="hx-t" style="${btnStyle(CFG.enabled,false,true)};width:auto;margin:0;">
          ${CFG.enabled ? '🟢 ON' : '🔴 OFF'}
        </button>
      </div>
    `;

    calibPanel.querySelector('#hx-p').onclick = () => {
      calib.active = true; setCalibStep('player');
      showToast('👆 Clique sobre seu jogador');
    };
    calibPanel.querySelector('#hx-b').onclick = () => {
      if (!calib.playerSample) { showToast('⚠️ Marque o jogador primeiro!'); return; }
      calib.active = true; setCalibStep('ball');
      showToast('👆 Clique sobre a bola');
    };
    calibPanel.querySelector('#hx-r').onclick = () => {
      calib.playerSample = null; calib.ballSample = null;
      calib.active = false; setCalibStep(null);
      CFG.ballRadiusMin=6; CFG.ballRadiusMax=12;
      CFG.playerRadiusMin=13; CFG.playerRadiusMax=30;
      showToast('🔄 Calibração resetada'); updateCalibPanel();
    };
    calibPanel.querySelector('#hx-t').onclick = () => {
      CFG.enabled = !CFG.enabled; saveConfig();
      updateCalibPanel();
      showToast(CFG.enabled ? '🎯 Mira ATIVADA' : '🚫 Mira DESATIVADA');
    };
  }

  // ── Analisar frame ────────────────────────────────────────────────────────
  function analyzeFrame(W, H) {
    if (!frameCircles.length) return;
    const circles  = frameCircles.slice();
    frameCircles   = [];
    liveSnapshot   = circles;

    const cx = W/2, cy = H/2;
    const ballCands   = circles.filter(c => c.r >= CFG.ballRadiusMin   && c.r <= CFG.ballRadiusMax);
    const playerCands = circles.filter(c => c.r >= CFG.playerRadiusMin && c.r <= CFG.playerRadiusMax);

    if (!ballCands.length || !playerCands.length) return;

    const ball = ballCands.reduce((best,c) =>
      dist(c.x,c.y,cx,cy) < dist(best.x,best.y,cx,cy) ? c : best, ballCands[0]);
    const me = playerCands.reduce((best,c) =>
      dist(c.x,c.y,cx,cy) < dist(best.x,best.y,cx,cy) ? c : best, playerCands[0]);

    const prevBX = state.ball.valid ? state.ball.x : ball.x;
    const prevBY = state.ball.valid ? state.ball.y : ball.y;

    state.player   = { x:me.x,   y:me.y,   r:me.r,   valid:true };
    state.ball     = { x:ball.x, y:ball.y, r:ball.r, valid:true };
    state.ballVelX = lerp(state.ballVelX, ball.x - prevBX, 0.35);
    state.ballVelY = lerp(state.ballVelY, ball.y - prevBY, 0.35);

    const d = dist(me.x, me.y, ball.x, ball.y);
    state.inContact = d < (me.r + ball.r + CFG.contactRadius);
    state.angle     = Math.atan2(ball.y - me.y, ball.x - me.x);
  }

  // ── Desenhar ──────────────────────────────────────────────────────────────
  function drawAim() {
    if (!overlayCtx) return;
    const W = overlayCanvas.width, H = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, W, H);

    // Modo calibração
    if (calib.active && calib.step) {
      overlayCtx.save();
      for (const c of liveSnapshot) {
        const isP = c.r >= CFG.playerRadiusMin && c.r <= CFG.playerRadiusMax;
        const isB = c.r >= CFG.ballRadiusMin   && c.r <= CFG.ballRadiusMax;
        overlayCtx.beginPath();
        overlayCtx.arc(c.x, c.y, c.r + 4, 0, Math.PI*2);
        overlayCtx.strokeStyle = isP ? 'rgba(0,200,255,0.85)'
                                : isB ? 'rgba(255,214,0,0.85)'
                                : 'rgba(255,255,255,0.2)';
        overlayCtx.lineWidth = 2;
        overlayCtx.stroke();
        overlayCtx.fillStyle = 'rgba(255,255,255,0.55)';
        overlayCtx.font = '9px monospace';
        overlayCtx.fillText('r' + c.r.toFixed(0), c.x + c.r + 2, c.y - c.r);
      }
      if (calib.crosshair) {
        const { x, y } = calib.crosshair;
        const col = calib.step === 'player' ? '#00c8ff' : '#ffd600';
        overlayCtx.strokeStyle = col;
        overlayCtx.lineWidth = 1.5;
        overlayCtx.globalAlpha = 0.9;
        overlayCtx.setLineDash([4,3]);
        overlayCtx.beginPath();
        overlayCtx.moveTo(x-16,y); overlayCtx.lineTo(x+16,y);
        overlayCtx.moveTo(x,y-16); overlayCtx.lineTo(x,y+16);
        overlayCtx.stroke();
        overlayCtx.setLineDash([]);
        overlayCtx.beginPath();
        overlayCtx.arc(x, y, 5, 0, Math.PI*2);
        overlayCtx.stroke();
      }
      overlayCtx.restore();
      return;
    }

    // Mira normal
    if (!CFG.enabled || !state.inContact || !state.ball.valid || !state.player.valid) return;

    const ctx   = overlayCtx;
    const { x:bx, y:by } = state.ball;
    const angle = state.angle;
    const ex    = bx + Math.cos(angle) * CFG.arrowLength;
    const ey    = by + Math.sin(angle) * CFG.arrowLength;

    ctx.save();
    ctx.globalAlpha = CFG.opacity;
    if (CFG.glowEffect) { ctx.shadowColor = CFG.color; ctx.shadowBlur = 8; }

    ctx.beginPath();
    ctx.setLineDash(CFG.dashSegments);
    ctx.strokeStyle = CFG.color; ctx.lineWidth = CFG.lineWidth; ctx.lineCap = 'round';
    ctx.moveTo(bx,by); ctx.lineTo(ex,ey); ctx.stroke();

    ctx.setLineDash([]);
    for (let i=1; i<=CFG.predictionSteps; i++) {
      const t = i/CFG.predictionSteps;
      ctx.beginPath();
      ctx.globalAlpha = CFG.opacity*(1-t)*0.5;
      ctx.fillStyle = CFG.color;
      ctx.arc(
        ex + Math.cos(angle)*CFG.arrowLength*0.4*t,
        ey + Math.sin(angle)*CFG.arrowLength*0.4*t,
        Math.max(0.5, 3-t*2), 0, Math.PI*2
      );
      ctx.fill();
    }
    ctx.globalAlpha = CFG.opacity;

    if (CFG.showArrowHead) {
      const hl=12, ha=0.42;
      ctx.beginPath(); ctx.setLineDash([]);
      ctx.strokeStyle=CFG.color; ctx.lineWidth=CFG.lineWidth+0.5;
      ctx.moveTo(ex,ey); ctx.lineTo(ex-hl*Math.cos(angle-ha), ey-hl*Math.sin(angle-ha));
      ctx.moveTo(ex,ey); ctx.lineTo(ex-hl*Math.cos(angle+ha), ey-hl*Math.sin(angle+ha));
      ctx.stroke();
    }
    if (CFG.showDot) {
      ctx.beginPath(); ctx.setLineDash([]);
      ctx.arc(bx, by, state.ball.r+3, 0, Math.PI*2);
      ctx.strokeStyle=CFG.color; ctx.lineWidth=1.5;
      ctx.globalAlpha=CFG.opacity*0.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop() {
    if (gameCanvas) {
      if (overlayCanvas &&
        (overlayCanvas.width!==gameCanvas.width || overlayCanvas.height!==gameCanvas.height)) {
        overlayCanvas.width=gameCanvas.width; overlayCanvas.height=gameCanvas.height;
      }
      analyzeFrame(gameCanvas.width, gameCanvas.height);
      drawAim();
    }
    rafId = requestAnimationFrame(loop);
  }

  function init() {
    if (gameCanvas) return;
    const canvas = findGameCanvas();
    if (!canvas) return;
    gameCanvas = canvas;
    loadConfig();
    createOverlay(canvas);
    createCalibPanel();
    if (!rafId) loop();
    showToast('🎯 HaxAim — Clique em Marcar Jogador para calibrar');
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    init();
    if (gameCanvas || attempts > 60) clearInterval(timer);
  }, 500);

  new MutationObserver(() => { if (!gameCanvas) init(); })
    .observe(document.documentElement, { childList:true, subtree:true });

  // ── Atalhos ───────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
    switch(e.key.toLowerCase()) {
      case 'c':
        calib.active = !calib.active;
        if (calib.active) { setCalibStep('player'); showToast('📍 Clique sobre seu jogador'); }
        else { setCalibStep(null); showToast('❌ Calibração cancelada'); }
        break;
      case 'm':
        CFG.enabled = !CFG.enabled;
        showToast(CFG.enabled ? '🎯 Mira ATIVADA' : '🚫 Mira DESATIVADA');
        saveConfig(); updateCalibPanel(); break;
      case '+': case '=':
        CFG.arrowLength = Math.min(400, CFG.arrowLength+20);
        showToast('📏 '+CFG.arrowLength+'px'); saveConfig(); break;
      case '-':
        CFG.arrowLength = Math.max(40, CFG.arrowLength-20);
        showToast('📏 '+CFG.arrowLength+'px'); saveConfig(); break;
      case '[':
        CFG.opacity = Math.max(0.1, parseFloat((CFG.opacity-0.1).toFixed(1)));
        showToast('🌑 '+Math.round(CFG.opacity*100)+'%'); saveConfig(); break;
      case ']':
        CFG.opacity = Math.min(1.0, parseFloat((CFG.opacity+0.1).toFixed(1)));
        showToast('☀️ '+Math.round(CFG.opacity*100)+'%'); saveConfig(); break;
      case 'escape':
        if (calib.active) { calib.active=false; setCalibStep(null); showToast('❌ Calibração cancelada'); }
        break;
    }
  });

  // ── Config ────────────────────────────────────────────────────────────────
  function saveConfig() {
    try { localStorage.setItem('haxAimCFG', JSON.stringify(CFG)); } catch(_) {}
  }
  function loadConfig() {
    try {
      const raw = localStorage.getItem('haxAimCFG');
      if (raw) Object.assign(CFG, JSON.parse(raw));
    } catch(_) {}
  }

  window.__haxAimCFG   = CFG;
  window.__haxAimSave  = saveConfig;
  window.__haxAimState = state;
  window.__haxAimCalib = calib;

  // ── Toast ─────────────────────────────────────────────────────────────────
  let toastEl=null, toastTimer=null;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = [
        'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
        'background:rgba(0,0,0,0.88)','color:#fff',
        'font-family:Segoe UI,sans-serif','font-size:13px',
        'padding:9px 22px','border-radius:999px','z-index:999999',
        'pointer-events:none','border:1px solid rgba(255,255,255,0.12)',
        'box-shadow:0 4px 20px rgba(0,0,0,0.5)','transition:opacity 0.3s',
        'white-space:nowrap'
      ].join(';');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 2500);
  }

})();
