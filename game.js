// game.js — Mario Divs — Física IDÊNTICA ao Super Mario Bros (NES)
// Referência: https://meatfighter.com/nintendoassessment/
// COORDENADAS: py = altura dos PÉS acima do nível do chão (py=0 → no chão)
// CSS bottom = py + GROUND_H

(function () {
  "use strict";

  /* ══════════════════════════════════════════
     CONSTANTES — Valores fiéis ao SMB original
     (convertidos de pixels NES para pixels CSS)
  ══════════════════════════════════════════ */
  const GROUND_H   = 50;      // Altura da faixa de chão em CSS
  const PW         = 40;      // Largura do Mario
  const PH         = { small: 48, big: 68, fire: 68 };

  // Física SMB original (escala ~2.5x do NES)
  const G          = 0.625;   // Gravidade por frame
  const G_HOLD     = 0.25;    // Gravidade reduzida segurando pulo (float suave)
  const WALK_ACCEL = 0.55;    // Aceleração andando
  const RUN_ACCEL  = 0.85;    // Aceleração correndo (B pressionado)
  const WALK_MAX   = 4.5;     // Velocidade máxima andando
  const RUN_MAX    = 7.5;     // Velocidade máxima correndo
  const FRIC_GROUND= 0.82;    // Fricção no chão (soltando tecla)
  const FRIC_STOP  = 0.70;    // Fricção ao virar de lado (skid)
  const JUMP_V_WALK= 13.0;    // Velocidade de pulo andando
  const JUMP_V_RUN = 15.5;    // Velocidade de pulo correndo
  const JUMP_HOLD_FRAMES = 14;// Frames que pode sustentar o pulo
  const BOUNCE_V   = 9.5;     // Bounce ao pisar inimigo
  const BOUNCE_V_RUN = 12.0;  // Bounce maior se correr ao pisar

  /* ══════════════════════════════════════════
     SETUP
  ══════════════════════════════════════════ */
  const world    = document.getElementById("world");
  const ui       = document.getElementById("ui");
  const lvl      = window.LEVEL_CONFIG;
  const SCREEN_W = window.innerWidth;
  const SCREEN_H = window.innerHeight;

  // Animações CSS
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    @keyframes coinUp {
      0%   { transform:translateY(0);    opacity:1; }
      100% { transform:translateY(72px); opacity:0; }
    }
    @keyframes squish {
      0%   { transform:scaleX(1)   scaleY(1);    opacity:1; }
      50%  { transform:scaleX(1.9) scaleY(0.15); opacity:.8; }
      100% { transform:scaleX(2.2) scaleY(0);    opacity:0; }
    }
    @keyframes bumpBlock {
      0%,100% { transform:translateY(0);    }
      40%     { transform:translateY(-8px); }
      70%     { transform:translateY(-4px); }
    }
    @keyframes fallAway {
      0%   { transform:rotate(0deg)   translateY(0);    opacity:1; }
      100% { transform:rotate(200deg) translateY(90px); opacity:0; }
    }
    @keyframes enemyDie {
      0%   { transform:translateY(0) scaleY(1); opacity:1; }
      30%  { transform:translateY(20px) scaleY(0.3); opacity:.9; }
      100% { transform:translateY(80px) scaleY(0); opacity:0; }
    }
    @keyframes starSpin {
      from { transform:rotate(0deg) scale(1); }
      50%  { transform:rotate(180deg) scale(1.3); }
      to   { transform:rotate(360deg) scale(1); }
    }
    @keyframes marioGrow {
      0%,100% { transform:scaleY(1); }
      50%     { transform:scaleY(1.15); }
    }
    @keyframes marioShrink {
      0%,100% { transform:scaleY(1); }
      50%     { transform:scaleY(0.85); }
    }
    @keyframes flagSlide {
      from { bottom: 100%; }
      to   { bottom: 8%; }
    }
    @keyframes scoreFloat {
      0%   { transform:translateY(0); opacity:1; }
      100% { transform:translateY(-60px); opacity:0; }
    }
    .koopa-el,.beetle-el,.piranha-wrap { position:absolute; box-sizing:border-box; }
    #mario-skid::before { content:""; position:absolute; bottom:-2px; left:4px;
      width:32px; height:4px; background:rgba(255,200,0,.7); border-radius:2px; }
  `;
  document.head.appendChild(styleTag);

  /* ══════════════════════════════════════════
     ESTADO DO PLAYER
  ══════════════════════════════════════════ */
  let px, py, pvx, pvy;
  let pjumping       = false;  // Está no ar
  let pjumpHeld      = false;  // Segurando tecla de pulo
  let pjumpFrames    = 0;      // Frames sustentando o pulo
  let pstate;                  // "small" | "big" | "fire"
  let pcoins         = 0;
  let pinv           = 0;      // Frames de invencibilidade
  let pdone          = false;
  let pskid          = false;  // Derrapando (virou de lado)
  let pface          = 1;      // 1=direita, -1=esquerda
  let prunning       = false;  // B pressionado
  let pOnGround      = false;
  let pScore         = 0;
  let pLives         = 3;

  /* ══════════════════════════════════════════
     LISTAS DE OBJETOS
  ══════════════════════════════════════════ */
  let solids    = [];
  let blockObjs = [];
  let luckyObjs = [];
  let coinObjs  = [];
  let goombas   = [];
  let koopas    = [];
  let beetles   = [];
  let piranhas  = [];
  let fballs    = [];
  let bfires    = [];
  let boss      = null;
  let particles = [];

  /* ══════════════════════════════════════════
     TECLADO
  ══════════════════════════════════════════ */
  const keys = {};
  let jumpPressed = false;

  document.addEventListener("keydown", e => {
    if (pdone) return;
    const prev = keys[e.key];
    keys[e.key] = true;

    // "B" = correr (Shift ou Z ou X)
    prunning = !!(keys["Shift"] || keys["z"] || keys["Z"] || keys["x"] || keys["X"]);

    // Pulo — apenas na borda de pressionamento (não mantido)
    if (!prev && (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W")) {
      if (!pjumping) {
        const speed = Math.abs(pvx);
        pvy = speed > 3.5 ? JUMP_V_RUN : JUMP_V_WALK;
        pjumping   = true;
        pjumpHeld  = true;
        pjumpFrames= 0;
        pOnGround  = false;
      }
    }
    // Fireball
    if (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "a") shootFireball();

    e.preventDefault && e.preventDefault();
  });

  document.addEventListener("keyup", e => {
    keys[e.key] = false;
    prunning = !!(keys["Shift"] || keys["z"] || keys["Z"] || keys["x"] || keys["X"]);

    // Soltar pulo encerra sustentação
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      pjumpHeld = false;
    }
  });

  /* ══════════════════════════════════════════
     UTILITÁRIOS
  ══════════════════════════════════════════ */
  function ph() { return PH[pstate] || 48; }
  function mbox() { return { x:px, y:py, w:PW, h:ph() }; }

  function hit(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x
        && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function overlapX(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x;
  }

  function mkEl(tag, css) {
    const d = document.createElement(tag);
    if (css) d.style.cssText = css;
    world.appendChild(d);
    return d;
  }

  // Efeito de pontuação flutuante
  function showScore(pts, x, y) {
    pScore += pts;
    const d = mkEl("div",
      `position:absolute;left:${x}px;bottom:${y+GROUND_H+10}px;
       color:#fff;font-family:'Courier New',monospace;font-weight:bold;font-size:14px;
       text-shadow:1px 1px 0 #000;pointer-events:none;z-index:50;
       animation:scoreFloat .8s ease-out forwards;`
    );
    d.textContent = pts;
    setTimeout(() => d.remove(), 850);
  }

  // Partícula de impacto
  function spawnParticle(x, y, color) {
    for (let i = 0; i < 5; i++) {
      const vx = (Math.random()-0.5)*5;
      const vy = Math.random()*5 + 2;
      particles.push({ x, y, vx, vy, life:30, color });
    }
  }

  /* ══════════════════════════════════════════
     PLAYER DOM
  ══════════════════════════════════════════ */
  const player = document.createElement("div");
  player.className = "player";
  player.id = "mario-el";
  world.appendChild(player);

  let sizeTransition = 0; // frames animando mudança de tamanho

  function syncPlayer() {
    let c = "player";
    if (pstate === "big")  c += " big";
    if (pstate === "fire") c += " fire big";

    const spd = Math.abs(pvx);
    if (spd > 0.3 && pOnGround) c += " running";

    // Indicador de derrapa (skid) — virou de lado ainda com velocidade
    pskid = pOnGround && (
      (pvx > 0.5 && keys["ArrowLeft"]) ||
      (pvx < -0.5 && keys["ArrowRight"])
    );

    player.className = c;
    player.id        = "mario-el" + (pskid ? " mario-skid" : "");
    player.style.left    = px + "px";
    player.style.bottom  = (py + GROUND_H) + "px";
    player.style.width   = PW + "px";
    player.style.height  = ph() + "px";
    // Espelha baseado na direção
    player.style.transform = pface < 0 ? "scaleX(-1)" : "scaleX(1)";
    // Piscada de invencibilidade (a cada 4 frames)
    player.style.opacity = (pinv > 0 && Math.floor(pinv/4)%2===0) ? "0.25" : "1";
  }

  /* ══════════════════════════════════════════
     COLISÃO VERTICAL DO PLAYER
     — SMB original: resolvida frame a frame
  ══════════════════════════════════════════ */
  function resolvePlayerVertical(prevPy) {
    if (pvy <= 0) {
      // Caindo → verificar pouso em sólidos
      for (const s of solids) {
        const sTop = s.y + s.h;
        if (px + PW <= s.x + 1 || px >= s.x + s.w - 1) continue;
        if (prevPy >= sTop - 1 && py <= sTop) {
          py = sTop;
          pvy = 0;
          pjumping  = false;
          pjumpHeld = false;
          pOnGround = true;
          return;
        }
      }
    } else {
      // Subindo → verificar cabeça em blocos/lucky
      // Usa sweep: qualquer ponto entre prevPy+ph e py+ph conta
      const hN = py + ph();
      const hP = prevPy + ph();
      for (const b of blockObjs) {
        if (px+PW <= b.x+2 || px >= b.x+b.w-2) continue;
        // A cabeça passou pela base do bloco neste frame
        if (hP <= b.y + b.h && hN >= b.y) {
          py  = b.y - ph();
          pvy = -2.5;
          b.el.style.animation = "none";
          void b.el.offsetWidth;
          b.el.style.animation = "bumpBlock .18s ease";
          return;
        }
      }
      for (const l of luckyObjs) {
        if (px+PW <= l.x+2 || px >= l.x+l.w-2) continue;
        if (hP <= l.y + l.h && hN >= l.y) {
          py  = l.y - ph();
          pvy = -2.5;
          if (!l.used) activateLucky(l);
          return;
        }
      }
    }
  }

  /* ══════════════════════════════════════════
     COLISÃO HORIZONTAL DO PLAYER
  ══════════════════════════════════════════ */
  function resolvePlayerHorizontal() {
    for (const s of solids) {
      // Sem sobreposição vertical real
      if (py + ph() <= s.y || py >= s.y + s.h) continue;

      // Se Mario está subindo e a cabeça ainda mal tocou na base do sólido,
      // deixa passar — a colisão vertical vai resolver (bater com a cabeça).
      // Isso permite pular por baixo de blocos em fileiras.
      if (pvy > 0 && py + ph() < s.y + 6) continue;

      const overlapRight = (px + PW) - s.x;
      const overlapLeft  = (s.x + s.w) - px;

      // Resolve pelo lado de menor invasão
      if (overlapRight > 0 && overlapLeft > 0) {
        if (pvx >= 0 && overlapRight < overlapLeft && overlapRight < PW) {
          px = s.x - PW; pvx = 0;
        } else if (pvx <= 0 && overlapLeft < overlapRight && overlapLeft < PW) {
          px = s.x + s.w; pvx = 0;
        }
      }
    }
  }

  /* ══════════════════════════════════════════
     LUCKY BLOCK
  ══════════════════════════════════════════ */
  function activateLucky(l) {
    l.used = true;
    l.el.style.background  = "#888";
    l.el.style.borderColor = "#555";
    l.el.style.color       = "transparent";
    l.el.style.animation   = "bumpBlock .18s ease";

    if (pstate === "small") {
      pstate = "big";
      // Animação de crescimento (igual ao SMB)
      player.style.animation = "marioGrow .3s steps(4) forwards";
      setTimeout(() => player.style.animation = "", 320);
    } else if (pstate === "big") {
      pstate = "fire";
    }

    // Moeda animada saindo do bloco
    const c = mkEl("div",
      `position:absolute;left:${l.x+10}px;bottom:${l.y+44+GROUND_H}px;
       width:20px;height:20px;
       background:radial-gradient(circle at 40% 35%,#ffe040,#c88000);
       border-radius:50%;border:2px solid #a06000;
       pointer-events:none;z-index:20;
       animation:coinUp .55s ease-out forwards;`
    );
    showScore(100, l.x, l.y + 44);
    setTimeout(() => c.remove(), 580);
  }

  /* ══════════════════════════════════════════
     DANO NO MARIO — SMB: 1 hit shrink, 2nd = morte
  ══════════════════════════════════════════ */
  function takeDamage() {
    if (pinv > 0 || pdone) return;
    pinv = 140; // ~2.3 segundos de invencibilidade

    if (pstate === "fire" || pstate === "big") {
      pstate = "small";
      player.style.animation = "marioShrink .3s steps(4) forwards";
      setTimeout(() => player.style.animation = "", 320);
    } else {
      // Morte — animação de morte igual ao SMB
      pdone = true;
      pvy   = 0;
      pvx   = 0;
      pjumping = false;
      player.style.transition   = "none";
      player.style.transform    = "scaleX(1)";
      // Espera 20 frames, depois pula e some
      setTimeout(() => {
        player.style.transition = "transform .1s, opacity .1s";
        // Pulo de morte
        let deadY = py;
        let deadV = 14;
        const deadInterval = setInterval(() => {
          deadV -= 0.7;
          deadY += deadV;
          player.style.bottom = (deadY + GROUND_H) + "px";
          if (deadY < -200) {
            clearInterval(deadInterval);
            pLives--;
            setTimeout(() => {
              if (pLives <= 0) {
                document.body.innerHTML = `
                  <div style="position:fixed;inset:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Courier New',monospace;color:#fff;">
                    <div style="font-size:32px;margin-bottom:20px;text-shadow:2px 2px 0 #f00;">GAME OVER</div>
                    <button onclick="location.href='index.html'" style="padding:12px 32px;font-size:18px;background:#e52222;color:#fff;border:4px solid #000;cursor:pointer;font-family:inherit;">MENU</button>
                  </div>`;
              } else {
                location.reload();
              }
            }, 400);
          }
        }, 16);
      }, 300);
    }
  }

  /* ══════════════════════════════════════════
     EFEITO DE MORTE DE INIMIGO (SMB: achata e some)
  ══════════════════════════════════════════ */
  function squishAt(x, y) {
    const e = mkEl("div",
      `position:absolute;left:${x}px;bottom:${y+GROUND_H}px;
       width:38px;height:16px;background:#8B1a00;border-radius:50%;
       pointer-events:none;z-index:15;
       animation:squish .32s ease-out forwards;`
    );
    setTimeout(() => e.remove(), 360);
  }

  function killEnemy(list, idx, pts) {
    const e = list[idx];
    squishAt(e.x, e.y);
    showScore(pts || 100, e.x, e.y);
    e.el.remove();
    list.splice(idx, 1);
  }

  /* ══════════════════════════════════════════
     FÍSICA GENÉRICA DE INIMIGO
  ══════════════════════════════════════════ */
  function stepEnemy(e) {
    e.vy = (e.vy || 0) - G;
    const prevY = e.y;
    e.y += e.vy;

    // Pousa em sólido
    if (e.vy <= 0) {
      for (const s of solids) {
        const sTop = s.y + s.h;
        if (e.x + e.w <= s.x + 1 || e.x >= s.x + s.w - 1) continue;
        if (prevY >= sTop - 2 && e.y <= sTop) {
          e.y = sTop; e.vy = 0; e.onGround = true; break;
        }
      }
    } else {
      e.onGround = false;
    }

    // Caiu no void
    if (e.y < -400) return true;
    return false;
  }

  // Verifica se há sólido abaixo (para inimigos não caírem da borda)
  function solidExistsBelow(edgeX, ey, ew) {
    for (const s of solids) {
      const sTop = s.y + s.h;
      if (Math.abs(sTop - ey) <= 10 && edgeX > s.x + 2 && edgeX < s.x + s.w - 2) return true;
    }
    return false;
  }

  /* ══════════════════════════════════════════
     FIREBALL DO MARIO
  ══════════════════════════════════════════ */
  let fireballCooldown = 0;

  function shootFireball() {
    if (pstate !== "fire" || fireballCooldown > 0 || fballs.length >= 2) return;
    fireballCooldown = 20; // Máximo 2 fireballs em tela (fiel ao SMB)
    const dir = pface;
    const e = document.createElement("div");
    e.className = "fireball";
    world.appendChild(e);
    fballs.push({
      el: e,
      x:  px + (dir > 0 ? PW : -18),
      y:  py + ph() * 0.4,
      vx: dir * 10,
      vy: 4
    });
  }

  function updateFireballs() {
    if (fireballCooldown > 0) fireballCooldown--;

    for (let i = fballs.length - 1; i >= 0; i--) {
      const f = fballs[i];
      f.vy -= 0.5;
      f.x  += f.vx;
      f.y  += f.vy;

      // Ricochete no chão (igual SMB — não some, quica)
      if (f.y < 0) { f.y = 0; f.vy = Math.abs(f.vy) * 0.7 + 2.5; }
      if (f.y < -300) { f.el.remove(); fballs.splice(i,1); continue; }

      f.el.style.left   = f.x + "px";
      f.el.style.bottom = (f.y + GROUND_H) + "px";

      const fb = { x:f.x, y:f.y, w:18, h:18 };
      let dead = false;

      // Colisão com sólidos
      for (const s of solids) {
        if (hit(fb, s)) { dead = true; break; }
      }

      if (!dead) for (let j = goombas.length-1; j >= 0; j--) {
        if (hit(fb, goombas[j])) { killEnemy(goombas, j, 200); dead = true; break; }
      }
      if (!dead) for (let j = koopas.length-1; j >= 0; j--) {
        if (hit(fb, koopas[j])) { killEnemy(koopas, j, 200); dead = true; break; }
      }
      if (!dead) for (let j = beetles.length-1; j >= 0; j--) {
        if (hit(fb, beetles[j])) { killEnemy(beetles, j, 200); dead = true; break; }
      }
      if (!dead) for (let j = piranhas.length-1; j >= 0; j--) {
        const p = piranhas[j];
        if (p.phase !== "hidden") {
          const pb = { x:p.pipeX+8, y:p.yCur, w:44, h:68 };
          if (hit(fb, pb)) {
            showScore(200, p.pipeX, p.yCur + 30);
            p.wrap.style.animation = "fallAway .4s ease-out forwards";
            setTimeout(() => p.wrap.remove(), 430);
            piranhas.splice(j,1); dead = true; break;
          }
        }
      }
      if (!dead && boss && hit(fb, { x:boss.x, y:boss.y, w:boss.w, h:boss.h })) {
        hitBoss(); dead = true;
      }

      if (dead || f.x < -40 || f.x > lvl.width + 40) {
        f.el.remove(); fballs.splice(i,1);
      }
    }
  }

  /* ══════════════════════════════════════════
     GOOMBAS
  ══════════════════════════════════════════ */
  function updateGoombas() {
    for (let j = goombas.length-1; j >= 0; j--) {
      const g = goombas[j];
      if (stepEnemy(g)) { g.el.remove(); goombas.splice(j,1); continue; }

      if (g.onGround) {
        g.x += g.vx;
        // Vira nas bordas do mundo
        if (g.x <= 0)              { g.x = 0;              g.vx =  Math.abs(g.vx); }
        if (g.x >= lvl.width-g.w)  { g.x = lvl.width-g.w;  g.vx = -Math.abs(g.vx); }
        // Vira na borda de plataforma
        const edgeX = g.vx > 0 ? g.x+g.w+2 : g.x-2;
        if (!solidExistsBelow(edgeX, g.y, g.w)) g.vx *= -1;
      }

      g.el.style.left   = g.x + "px";
      g.el.style.bottom = (g.y + GROUND_H) + "px";

      // Colisão com Mario
      if (hit(mbox(), g)) {
        const prevPy = py - pvy;
        // Pisou em cima (vetor vindo de cima)
        if (pvy < 0 && prevPy + 2 >= g.y + g.h) {
          killEnemy(goombas, j, 100);
          pvy = prunning ? BOUNCE_V_RUN : BOUNCE_V;
        } else {
          takeDamage();
        }
      }
    }
  }

  /* ══════════════════════════════════════════
     KOOPA TROOPA
  ══════════════════════════════════════════ */
  function makeKoopaEl(x) {
    const w = document.createElement("div");
    w.className = "koopa-el";
    w.style.cssText = `left:${x}px;bottom:${GROUND_H}px;width:36px;height:48px;
      background:#3a8a00;border:3px solid #1a4400;border-radius:50% 50% 10% 10%;`;
    const shell = document.createElement("div");
    shell.style.cssText = `position:absolute;bottom:2px;left:2px;right:2px;height:55%;
      background:#4ab000;border-radius:40% 40% 10% 10%;border:2px solid #1a6600;`;
    const eyes = document.createElement("div");
    eyes.style.cssText = `position:absolute;top:8px;left:5px;width:10px;height:10px;
      background:#fff;border-radius:50%;box-shadow:14px 0 0 #fff;`;
    w.appendChild(shell); w.appendChild(eyes);
    world.appendChild(w);
    return w;
  }

  function updateKoopas() {
    for (let j = koopas.length-1; j >= 0; j--) {
      const k = koopas[j];
      if (stepEnemy(k)) { k.el.remove(); koopas.splice(j,1); continue; }

      if (k.shell) {
        k.shellTimer--;
        // Carapaça em movimento
        if (Math.abs(k.shellVx) > 0.3) {
          k.x += k.shellVx;
          // Fricção leve
          k.shellVx *= 0.997;

          if (k.x <= 0)             { k.x = 0;              k.shellVx =  Math.abs(k.shellVx); }
          if (k.x >= lvl.width-k.w) { k.x = lvl.width-k.w;  k.shellVx = -Math.abs(k.shellVx); }

          // Colide com sólidos lateralmente
          for (const s of solids) {
            if (k.y + k.h > s.y && k.y < s.y + s.h) {
              if (k.shellVx > 0 && k.x+k.w > s.x && k.x < s.x) {
                k.shellVx = -Math.abs(k.shellVx); break;
              }
              if (k.shellVx < 0 && k.x < s.x+s.w && k.x+k.w > s.x+s.w) {
                k.shellVx = Math.abs(k.shellVx); break;
              }
            }
          }

          // Carapaça mata goombas e outros koopas
          const kb = { x:k.x, y:k.y, w:k.w, h:k.h };
          for (let ei = goombas.length-1; ei >= 0; ei--) {
            if (hit(kb, goombas[ei])) {
              showScore(100, goombas[ei].x, goombas[ei].y);
              squishAt(goombas[ei].x, goombas[ei].y);
              goombas[ei].el.remove(); goombas.splice(ei,1);
            }
          }

          // Carapaça machuca Mario se em movimento
          if (hit(mbox(), kb)) takeDamage();
        }

        // Ressurge após timer
        if (k.shellTimer <= 0 && Math.abs(k.shellVx) < 0.5) {
          k.shell = false; k.vx = -1.5; k.h = 48;
          k.el.style.height = "48px";
          k.el.style.background = "#3a8a00";
          k.el.style.borderRadius = "50% 50% 10% 10%";
        }

        // Mario pisa na carapaça parada → chuta
        if (!hit(mbox(), { x:k.x, y:k.y, w:k.w, h:k.h })) {
          // ok
        } else {
          const prevPy = py - pvy;
          if (pvy < 0 && prevPy + 2 >= k.y + k.h) {
            if (Math.abs(k.shellVx) < 0.5) {
              // Chutar carapaça parada
              k.shellVx = px < k.x ? 9 : -9;
              showScore(400, k.x, k.y);
            }
            pvy = BOUNCE_V;
          }
        }

      } else {
        // Andando normalmente
        if (k.onGround) {
          k.x += k.vx;
          if (k.x <= 0)             { k.x = 0;              k.vx =  Math.abs(k.vx); }
          if (k.x >= lvl.width-k.w) { k.x = lvl.width-k.w;  k.vx = -Math.abs(k.vx); }
          const edgeX = k.vx > 0 ? k.x+k.w+2 : k.x-2;
          if (!solidExistsBelow(edgeX, k.y, k.w)) k.vx *= -1;
        }

        if (hit(mbox(), { x:k.x, y:k.y, w:k.w, h:k.h })) {
          const prevPy = py - pvy;
          if (pvy < 0 && prevPy + 2 >= k.y + k.h) {
            // Pisar → vira carapaça
            k.shell = true; k.shellVx = 0; k.shellTimer = 300; k.h = 26;
            k.el.style.height = "26px";
            k.el.style.background = "#b8860b";
            k.el.style.borderRadius = "6px";
            pvy = BOUNCE_V;
            showScore(100, k.x, k.y);
          } else {
            takeDamage();
          }
        }
      }

      k.el.style.left   = k.x + "px";
      k.el.style.bottom = (k.y + GROUND_H) + "px";
    }
  }

  /* ══════════════════════════════════════════
     BUZZY BEETLE
  ══════════════════════════════════════════ */
  function makeBeetleEl(x) {
    const w = document.createElement("div");
    w.className = "beetle-el";
    w.style.cssText = `left:${x}px;bottom:${GROUND_H}px;width:36px;height:32px;
      background:#111155;border:3px solid #000033;border-radius:50% 50% 20% 20%;`;
    const shine = document.createElement("div");
    shine.style.cssText = `position:absolute;top:4px;left:6px;width:12px;height:7px;
      background:rgba(255,255,255,.22);border-radius:50%;`;
    w.appendChild(shine); world.appendChild(w);
    return w;
  }

  function updateBeetles() {
    for (let j = beetles.length-1; j >= 0; j--) {
      const b = beetles[j];
      if (stepEnemy(b)) { b.el.remove(); beetles.splice(j,1); continue; }

      if (b.stomped) {
        b.stompTimer--;
        if (b.stompTimer <= 0) {
          b.stomped = false; b.h = 32;
          b.el.style.height = "32px";
          b.el.style.background = "#111155";
        }
      }

      if (!b.stomped && b.onGround) {
        b.x += b.vx;
        if (b.x <= 0)             { b.x = 0;              b.vx =  Math.abs(b.vx); }
        if (b.x >= lvl.width-b.w) { b.x = lvl.width-b.w;  b.vx = -Math.abs(b.vx); }
        const edgeX = b.vx > 0 ? b.x+b.w+2 : b.x-2;
        if (!solidExistsBelow(edgeX, b.y, b.w)) b.vx *= -1;
      }

      b.el.style.left   = b.x + "px";
      b.el.style.bottom = (b.y + GROUND_H) + "px";

      if (hit(mbox(), { x:b.x, y:b.y, w:b.w, h:b.h })) {
        const prevPy = py - pvy;
        if (pvy < 0 && prevPy + 2 >= b.y + b.h) {
          if (!b.stomped) {
            b.stomped = true; b.stompTimer = 280; b.h = 16;
            b.el.style.height = "16px";
            b.el.style.background = "#000033";
            pvy = BOUNCE_V;
            showScore(100, b.x, b.y);
          } else {
            // Segundo pisão → morre
            showScore(200, b.x, b.y);
            squishAt(b.x, b.y);
            b.el.remove(); beetles.splice(j,1);
            pvy = BOUNCE_V;
          }
        } else {
          if (!b.stomped) takeDamage();
        }
      }
    }
  }

  /* ══════════════════════════════════════════
     PIRANHA PLANT
  ══════════════════════════════════════════ */
  function makePiranhaEl(pipeX) {
    const wrap = document.createElement("div");
    wrap.className = "piranha-wrap";
    wrap.style.cssText = `
      left:${pipeX+11}px; bottom:${GROUND_H+50}px;
      width:38px; height:42px;
      display:none; overflow:visible; z-index:6;
    `;
    const stem = document.createElement("div");
    stem.style.cssText = `
      position:absolute; bottom:0; left:8px;
      width:22px; height:42px;
      background:#228B22; border:3px solid #145214; border-radius:4px;
    `;
    const head = document.createElement("div");
    head.style.cssText = `
      position:absolute; top:-24px; left:-5px;
      width:48px; height:28px;
      background:#cc2020; border:3px solid #700;
      border-radius:50% 50% 10% 10%;
    `;
    const teeth = document.createElement("div");
    teeth.style.cssText = `position:absolute;bottom:2px;left:5px;
      font-size:11px;color:#fff;letter-spacing:3px;font-weight:bold;`;
    teeth.textContent = "▲▲▲";
    head.appendChild(teeth);
    wrap.appendChild(stem); wrap.appendChild(head);
    world.appendChild(wrap);
    return { wrap, head };
  }

  function updatePiranhas() {
    for (let i = piranhas.length-1; i >= 0; i--) {
      const p = piranhas[i];
      // SMB original: piranha NÃO sobe se Mario estiver em cima do pipe
      const marioClose = Math.abs(px - p.pipeX) < 72;
      p.timer--;

      if (p.phase === "hidden") {
        if (p.timer <= 0 && !marioClose) {
          p.phase = "rising"; p.yCur = -42;
          p.wrap.style.display = "";
        }
      } else if (p.phase === "rising") {
        p.yCur = Math.min(p.yCur + 1.8, 44);
        p.wrap.style.bottom = (GROUND_H + 50 + p.yCur) + "px";
        if (p.yCur >= 44) { p.phase = "out"; p.timer = 80; }
      } else if (p.phase === "out") {
        if (p.timer <= 0) p.phase = "falling";
      } else if (p.phase === "falling") {
        p.yCur = Math.max(p.yCur - 1.8, -42);
        p.wrap.style.bottom = (GROUND_H + 50 + p.yCur) + "px";
        if (p.yCur <= -42) {
          p.phase = "hidden";
          p.timer = 55 + (Math.random() * 45 | 0);
          p.wrap.style.display = "none";
        }
      }

      // Hitbox
      if (p.phase !== "hidden") {
        const pb = { x:p.pipeX+6, y:p.yCur+20, w:46, h:52 };
        if (hit(mbox(), pb)) takeDamage();

        // Stompo na cabeça
        const prevPy = py - pvy;
        if (pvy < 0 && prevPy + 2 >= pb.y + pb.h && hit({ x:px, y:py, w:PW, h:4 }, pb)) {
          showScore(200, p.pipeX, p.yCur + 30);
          p.wrap.style.animation = "fallAway .4s ease-out forwards";
          setTimeout(() => p.wrap.remove(), 430);
          piranhas.splice(i,1); pvy = BOUNCE_V;
        }
      }
    }
  }

  /* ══════════════════════════════════════════
     BOWSER — Comportamento fiel ao NES
  ══════════════════════════════════════════ */
  function makeBossEl(x) {
    const wrap = document.createElement("div");
    wrap.className = "boss";
    wrap.style.left   = x + "px";
    wrap.style.bottom = GROUND_H + "px";

    const hpBar = document.createElement("div");
    hpBar.style.cssText = `position:absolute;top:-22px;left:0;right:0;
      height:10px;background:#400;border:2px solid #000;border-radius:5px;overflow:hidden;`;
    const hpFill = document.createElement("div");
    hpFill.id = "bossHpFill";
    hpFill.style.cssText = "height:100%;width:100%;background:#e00;transition:width .2s;";
    hpBar.appendChild(hpFill);
    wrap.appendChild(hpBar);
    world.appendChild(wrap);
    return wrap;
  }

  function spawnBossFire() {
    if (!boss) return;
    const dx  = (px + PW/2) - (boss.x + boss.w/2);
    const spd = 6.5;
    const vx  = dx > 0 ? spd : -spd;
    const e   = document.createElement("div");
    e.style.cssText = `position:absolute;width:24px;height:24px;
      background:radial-gradient(circle at 40% 35%,#fff,#ff5500);
      border:2px solid #ff2200;border-radius:50%;
      box-shadow:0 0 10px #ff6600;z-index:9;`;
    world.appendChild(e);
    bfires.push({ el:e, x:boss.x+(vx>0?boss.w:-24), y:boss.y+30, vx, vy:2 });
  }

  function updateBossFires() {
    for (let i = bfires.length-1; i >= 0; i--) {
      const f = bfires[i];
      f.vy -= 0.15; f.x += f.vx; f.y += f.vy;
      if (f.y < 0) { f.y = 0; f.vy = Math.abs(f.vy)*0.6 + 1.5; }
      if (f.y < -300) { f.el.remove(); bfires.splice(i,1); continue; }
      f.el.style.left   = f.x + "px";
      f.el.style.bottom = (f.y + GROUND_H) + "px";
      if (hit({ x:f.x, y:f.y, w:24, h:24 }, mbox())) {
        takeDamage(); f.el.remove(); bfires.splice(i,1); continue;
      }
      if (f.x < -40 || f.x > lvl.width+40) { f.el.remove(); bfires.splice(i,1); }
    }
  }

  function hitBoss() {
    if (!boss || boss.invTimer > 0) return;
    boss.hp--;
    boss.invTimer = 45;
    boss.el.style.filter = "brightness(5) saturate(0)";
    setTimeout(() => { if (boss) boss.el.style.filter = ""; }, 230);
    const fill = document.getElementById("bossHpFill");
    if (fill) fill.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
    if (boss.hp <= boss.maxHp / 2) boss.enraged = true;
    if (boss.hp <= 0) {
      // Explosão
      for (let i = 0; i < 14; i++) {
        const ex = document.createElement("div");
        ex.style.cssText = `position:absolute;
          left:${boss.x + Math.random()*80}px;
          bottom:${boss.y + GROUND_H + Math.random()*80}px;
          width:${10+Math.random()*26|0}px;height:${10+Math.random()*26|0}px;
          background:radial-gradient(circle,#fff,#ff8800,#ff0000);
          border-radius:50%;pointer-events:none;
          animation:squish .55s ease-out forwards;`;
        world.appendChild(ex);
        setTimeout(() => ex.remove(), 580);
      }
      boss.el.remove(); boss = null;
      bfires.forEach(f => f.el.remove()); bfires.length = 0;
      showScore(5000, px, py + 40);
    }
  }

  function updateBoss() {
    if (!boss) return;
    if (boss.invTimer > 0) boss.invTimer--;

    const spd    = boss.enraged ? 2.8 : 1.8;
    const jForce = boss.enraged ? 14  : 11;
    const fRate  = boss.enraged ? 65  : 120;

    boss.vy -= G * 0.7;
    boss.y  += boss.vy;
    if (boss.y <= 0) { boss.y = 0; boss.vy = 0; boss.jumping = false; }

    const dirToMario = px < boss.x ? -1 : 1;
    boss.x += dirToMario * spd * 0.5;
    if (boss.x < boss.arenaL) boss.x = boss.arenaL;
    if (boss.x > boss.arenaR) boss.x = boss.arenaR;

    boss.jumpTimer++;
    const jumpInterval = boss.enraged ? 80 : 130;
    if (boss.jumpTimer >= jumpInterval && !boss.jumping) {
      boss.jumpTimer = 0; boss.vy = jForce; boss.jumping = true;
    }

    boss.fireTimer++;
    if (boss.fireTimer >= fRate) {
      boss.fireTimer = 0;
      spawnBossFire();
      if (boss.enraged) setTimeout(() => { if (boss) spawnBossFire(); }, 260);
    }

    boss.el.style.left   = boss.x + "px";
    boss.el.style.bottom = (boss.y + GROUND_H) + "px";

    if (hit(mbox(), { x:boss.x, y:boss.y, w:boss.w, h:boss.h })) {
      const prevPy = py - pvy;
      if (pvy < 0 && prevPy + 2 >= boss.y + boss.h) {
        hitBoss(); pvy = JUMP_V_WALK;
      } else {
        takeDamage();
      }
    }
  }

  /* ══════════════════════════════════════════
     PARTÍCULAS
  ══════════════════════════════════════════ */
  let particleCanvas = null;
  let pCtx = null;

  function initParticleCanvas() {
    particleCanvas = document.createElement("canvas");
    particleCanvas.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:200;`;
    particleCanvas.width  = SCREEN_W;
    particleCanvas.height = SCREEN_H;
    document.body.appendChild(particleCanvas);
    pCtx = particleCanvas.getContext("2d");
  }

  function updateParticles() {
    if (!pCtx) return;
    pCtx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.x  += p.vx; p.y  -= p.vy; p.vy -= 0.15; p.life--;
      if (p.life <= 0) { particles.splice(i,1); continue; }
      const camX = Math.max(0, Math.min(px - SCREEN_W/3, lvl.width - SCREEN_W));
      const sx = p.x - camX;
      const sy = SCREEN_H - (p.y + GROUND_H);
      pCtx.globalAlpha = p.life / 30;
      pCtx.fillStyle   = p.color || "#fff";
      pCtx.fillRect(sx - 3, sy - 3, 6, 6);
    }
    pCtx.globalAlpha = 1;
  }

  /* ══════════════════════════════════════════
     VITÓRIA
  ══════════════════════════════════════════ */
  function checkWin() {
    if (pdone) return;
    const allDead =
      goombas.length === 0 &&
      koopas.length === 0 &&
      beetles.length === 0 &&
      piranhas.length === 0 &&
      !boss;

    if (allDead) {
      pdone = true;
      const saved = parseInt(localStorage.getItem("totalCoins") || "0");
      localStorage.setItem("totalCoins", saved + pcoins);

      // Overlay de vitória estilo SMB
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.7);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:'Courier New',monospace;color:#fff;z-index:999;
        animation:none;
      `;
      overlay.innerHTML = `
        <div style="font-size:28px;text-shadow:2px 2px 0 #f90;margin-bottom:16px;">
          ★ FASE ${lvl.id} CLEAR! ★
        </div>
        <div style="font-size:16px;color:#ffd700;margin-bottom:8px;">
          MOEDAS: ${pcoins}
        </div>
        <div style="font-size:16px;color:#ffd700;margin-bottom:24px;">
          PONTOS: ${pScore}
        </div>
        <div style="font-size:11px;color:#aaa;">Carregando próxima fase...</div>
      `;
      document.body.appendChild(overlay);

      setTimeout(() => {
        if (lvl.nextLevel) window.location.href = lvl.nextLevel;
        else {
          overlay.innerHTML = `
            <div style="font-size:26px;text-shadow:2px 2px 0 #f90;margin-bottom:16px;">
              🎉 VOCÊ ZEROU! 🎉
            </div>
            <div style="font-size:14px;color:#ffd700;margin-bottom:8px;">PONTOS: ${pScore}</div>
            <button onclick="location.href='index.html'"
              style="margin-top:20px;padding:14px 36px;font-size:16px;background:#e52222;
                     color:#fff;border:4px solid #fff;cursor:pointer;font-family:inherit;">
              MENU
            </button>`;
        }
      }, 2500);
    }
  }

  /* ══════════════════════════════════════════
     CARREGA NÍVEL
  ══════════════════════════════════════════ */
  function loadLevel() {
    world.innerHTML = "";
    world.appendChild(player);
    world.style.width = lvl.width + "px";
    solids = []; blockObjs = []; luckyObjs = []; coinObjs = [];
    goombas = []; koopas = []; beetles = []; piranhas = [];
    fballs = []; bfires = []; boss = null; pdone = false;
    particles = [];

    // CHÃO
    (lvl.ground || []).forEach(g => {
      mkEl("div",
        `position:absolute;left:${g.x}px;bottom:0;width:${g.w}px;height:${GROUND_H}px;` +
        `background:#3a9a3a;border-top:4px solid #1a5a1a;box-sizing:border-box;` +
        `background-image:` +
          `repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(0,0,0,.18) 39px,rgba(0,0,0,.18) 40px),` +
          `repeating-linear-gradient(0deg,transparent,transparent 24px,rgba(0,0,0,.12) 24px,rgba(0,0,0,.12) 25px);`
      );
      solids.push({ x:g.x, y:-GROUND_H, w:g.w, h:GROUND_H });
    });

    // PLATAFORMAS
    (lvl.platforms || []).forEach(p => {
      const h = p.h || 20;
      mkEl("div",
        `position:absolute;left:${p.x}px;bottom:${p.y + GROUND_H}px;` +
        `width:${p.w}px;height:${h}px;` +
        `background:${p.color||"#8B5E3C"};border:3px solid ${p.border||"#3d2b1f"};box-sizing:border-box;`
      );
      solids.push({ x:p.x, y:p.y, w:p.w, h });
    });

    // PIPES
    (lvl.pipes || []).forEach(p => {
      const bW = 60, hX = 10, hH = 20, h = p.h || 80;
      mkEl("div",
        `position:absolute;left:${p.x}px;bottom:${GROUND_H}px;` +
        `width:${bW}px;height:${h}px;background:#3ac83a;border:3px solid #155a15;` +
        `box-sizing:border-box;z-index:4;`
      );
      mkEl("div",
        `position:absolute;left:${p.x - hX/2}px;bottom:${GROUND_H + h - hH}px;` +
        `width:${bW + hX}px;height:${hH + 4}px;background:#2db82d;border:3px solid #155a15;` +
        `border-radius:4px 4px 0 0;box-sizing:border-box;z-index:5;`
      );
      solids.push({ x:p.x - hX/2, y:h - hH, w:bW + hX, h:hH });
    });

    // BLOCOS MARRONS (indestrutíveis)
    (lvl.blocks || []).forEach(b => {
      const d = document.createElement("div");
      d.className = "block";
      d.style.left   = b.x + "px";
      d.style.bottom = (b.y + GROUND_H) + "px";
      world.appendChild(d);
      blockObjs.push({ el:d, x:b.x, y:b.y, w:40, h:40 });
      solids.push({ x:b.x, y:b.y, w:40, h:40 });
    });

    // LUCKY BLOCKS
    (lvl.lucky || []).forEach(l => {
      const d = document.createElement("div");
      d.className = "lucky";
      d.style.left   = l.x + "px";
      d.style.bottom = (l.y + GROUND_H) + "px";
      world.appendChild(d);
      luckyObjs.push({ el:d, x:l.x, y:l.y, w:40, h:40, used:false });
      solids.push({ x:l.x, y:l.y, w:40, h:40 });
    });

    // MOEDAS
    (lvl.coins || []).forEach(c => {
      const d = document.createElement("div");
      d.className = "coin";
      d.style.left   = c.x + "px";
      d.style.bottom = (c.y + GROUND_H) + "px";
      world.appendChild(d);
      coinObjs.push({ el:d, x:c.x, y:c.y, w:20, h:20 });
    });

    // GOOMBAS
    (lvl.enemies || []).forEach(e => {
      const d = document.createElement("div");
      d.className = "enemy";
      d.style.left   = e.x + "px";
      d.style.bottom = GROUND_H + "px";
      world.appendChild(d);
      const spawnY = findSpawnY(e.x, 40);
      goombas.push({ el:d, x:e.x, y:spawnY, w:40, h:40, vx:e.vx||-1.5, vy:0, onGround:true });
    });

    // KOOPAS
    (lvl.koopas || []).forEach(k => {
      const d = makeKoopaEl(k.x);
      const spawnY = findSpawnY(k.x, 36);
      koopas.push({ el:d, x:k.x, y:spawnY, w:36, h:48, vx:k.vx||-1.5, vy:0, onGround:true,
        shell:false, shellVx:0, shellTimer:0 });
    });

    // BEETLES
    (lvl.beetles || []).forEach(b => {
      const d = makeBeetleEl(b.x);
      const spawnY = findSpawnY(b.x, 36);
      beetles.push({ el:d, x:b.x, y:spawnY, w:36, h:32, vx:b.vx||-1.2, vy:0, onGround:true,
        stomped:false, stompTimer:0 });
    });

    // PIRANHAS
    (lvl.piranhas || []).forEach(p => {
      const { wrap, head } = makePiranhaEl(p.pipeX);
      piranhas.push({ wrap, head, pipeX:p.pipeX, phase:"hidden", yCur:-42, timer:p.delay||60 });
    });

    // BOSS
    if (lvl.boss) {
      const bx = lvl.width - 360;
      const d  = makeBossEl(bx);
      boss = {
        el:d, x:bx, y:0, w:80, h:80, vx:-1, vy:0,
        hp:8, maxHp:8, invTimer:0,
        jumping:false, jumpTimer:0, fireTimer:50,
        enraged:false,
        arenaL:lvl.width - 680,
        arenaR:lvl.width - 90
      };
    }

    // MARIO
    px = 80; py = 0; pvx = 0; pvy = 0;
    pjumping = true; pjumpHeld = false; pjumpFrames = 0;
    pstate = "small"; pcoins = 0; pinv = 0; pScore = 0;
    pOnGround = false; pface = 1;
    syncPlayer();
  }

  function findSpawnY(ex, ew) {
    let best = 0;
    for (const s of solids) {
      const sTop = s.y + s.h;
      if (sTop <= 0) continue;
      if (ex + ew > s.x + 2 && ex < s.x + s.w - 2 && sTop > best) best = sTop;
    }
    return best;
  }

  /* ══════════════════════════════════════════
     LOOP PRINCIPAL — Física idêntica ao SMB
  ══════════════════════════════════════════ */
  function update() {
    if (pdone) return;
    if (pinv > 0) pinv--;

    /* ─── HORIZONTAL ─── */
    const movingRight = keys["ArrowRight"] || keys["d"] || keys["D"];
    const movingLeft  = keys["ArrowLeft"]  || keys["a"] || keys["A"];
    const accel = prunning ? RUN_ACCEL : WALK_ACCEL;
    const maxV  = prunning ? RUN_MAX   : WALK_MAX;

    if (movingRight) {
      // Derrapa se estava indo para esquerda
      if (pvx < -0.5) { pvx *= FRIC_STOP; }
      else             { pvx  = Math.min(pvx + accel, maxV); }
      pface = 1;
    } else if (movingLeft) {
      if (pvx > 0.5) { pvx *= FRIC_STOP; }
      else            { pvx  = Math.max(pvx - accel, -maxV); }
      pface = -1;
    } else {
      // Fricção natural (mais suave no ar)
      const fric = pOnGround ? FRIC_GROUND : 0.94;
      pvx *= fric;
      if (Math.abs(pvx) < 0.06) pvx = 0;
    }

    /* ─── GRAVIDADE — Pulo variável (segurar = mais alto) ─── */
    // SMB: se segurar o pulo e estiver subindo, gravidade é reduzida
    const holdingJump = keys[" "] || keys["ArrowUp"] || keys["w"] || keys["W"];
    if (pjumping && holdingJump && pjumpHeld && pvy > 0) {
      pjumpFrames++;
      if (pjumpFrames < JUMP_HOLD_FRAMES) {
        pvy -= G_HOLD; // Gravidade reduzida ao segurar
      } else {
        pjumpHeld = false;
        pvy -= G;
      }
    } else {
      pvy -= G;
    }

    /* ─── MOVER ─── */
    const prevPy = py;
    const prevPx = px;
    px += pvx;
    py += pvy;

    /* ─── LIMITES X ─── */
    if (px < 0)            { px = 0;            pvx = 0; }
    if (px > lvl.width-PW) { px = lvl.width-PW; pvx = 0; }

    /* ─── COLISÃO VERTICAL ─── */
    pOnGround = false;
    resolvePlayerVertical(prevPy);

    /* ─── COLISÃO HORIZONTAL ─── */
    resolvePlayerHorizontal();

    /* ─── COLETANDO MOEDAS ─── */
    const mb = mbox();
    for (let i = coinObjs.length-1; i >= 0; i--) {
      if (hit(mb, coinObjs[i])) {
        coinObjs[i].el.remove();
        coinObjs.splice(i, 1);
        pcoins++;
        showScore(200, mb.x, mb.y + 20);
        spawnParticle(mb.x + 10, mb.y + 10, "#ffe040");
      }
    }

    /* ─── INIMIGOS E BOSS ─── */
    updateGoombas();
    updateKoopas();
    updateBeetles();
    updatePiranhas();
    updateBoss();
    updateFireballs();
    updateBossFires();

    /* ─── VOID ─── */
    if (py < -400) {
      pdone = true;
      setTimeout(() => location.reload(), 300);
      return;
    }

    /* ─── RENDER ─── */
    syncPlayer();
    updateParticles();

    /* ─── CÂMERA — Igual ao SMB: scroll suave, nunca volta ─── */
    const targetCam = Math.max(0, Math.min(px - SCREEN_W / 3, lvl.width - SCREEN_W));
    world.style.transform = `translateX(${-targetCam}px)`;

    /* ─── HUD ─── */
    const bHud  = boss ? `   👿 HP:${boss.hp}${boss.enraged ? "⚡" : ""}` : "";
    const total = goombas.length + koopas.length + beetles.length + piranhas.length + (boss ? 1 : 0);
    const stateLabel = pstate === "fire" ? "🔥FOGO" : pstate === "big" ? "⬆BIG" : "🍄SMALL";
    ui.innerText = `${lvl.id}   🪙${pcoins}   ${stateLabel}   ⭐${pScore}   👾${total}${bHud}   ❤️${pLives}`;

    checkWin();
    requestAnimationFrame(update);
  }

  /* ══════════════════════════════════════════
     INICIALIZAÇÃO
  ══════════════════════════════════════════ */
  initParticleCanvas();
  loadLevel();
  requestAnimationFrame(update);

})();