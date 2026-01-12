/**
 * NEON VOID SURVIVOR
 * A Vanilla JS Masterpiece
 */

// --- CONFIGURATION ---
const CONFIG = {
  PLAYER: { hp: 100, speed: 4.5, size: 15, fireRate: 300, damage: 10, magnet: 150 },
  ENEMIES: [
    { type: 'chaser', radius: 12, speed: 2.2, hp: 10, dmg: 15, color: '#f43f5e', score: 10, sides: 3, weight: 50, healDrop: 0.05 },
    { type: 'tank', radius: 22, speed: 1.1, hp: 50, dmg: 30, color: '#a855f7', score: 150, sides: 6, weight: 20, healDrop: 0.15 },
    { type: 'scout', radius: 8, speed: 3.8, hp: 5, dmg: 5, color: '#fcd34d', score: 20, sides: 4, weight: 25, healDrop: 0.02 },
    { type: 'dreadnought', radius: 60, speed: 0.45, hp: 250, dmg: 60, color: '#ef4444', score: 1250, sides: 8, weight: 4, healDrop: 0.4 },
    { type: 'overlord', radius: 110, speed: 0.25, hp: 1250, dmg: 100, color: '#ffffff', score: 7500, sides: 12, weight: 0.5, healDrop: 1.0 }
  ],
  UPGRADES: [
    { id: 'fireRate', name: 'Rapid Pulse', desc: '+20% Firing Speed', icon: '🔫', basePrice: 48 },
    { id: 'damage', name: 'Nano-Bolts', desc: '+25% Impact Damage', icon: '⚡', basePrice: 60 },
    { id: 'speed', name: 'Warp Drive', desc: '+15% Agility', icon: '🚀', basePrice: 36 },
    { id: 'health', name: 'Core Repair', desc: '+25 Max Integrity', icon: '🛠️', basePrice: 40 },
    { id: 'multi', name: 'Split Lens', desc: '+1 Projectile Streak', icon: '🔱', basePrice: 150 },
    { id: 'magnet', name: 'Flux Well', desc: '+50% Collection Range', icon: '🧲', basePrice: 30 }
  ]
};

// --- STATE ---
let gameState = 'MENU'; // MENU, PLAYING, LEVELING, GAMEOVER
let player = null;
let entities = { enemies: [], bullets: [], gems: [], particles: [], healthCores: [] };
let input = { keys: {}, mouse: { x: 0, y: 0 } };
let stats = { score: 0, coins: 0, highScore: parseInt(localStorage.getItem('neon-highscore')) || 0 };
let timers = { spawn: 0, fire: 0, lastFrame: 0 };
let screenShake = 0;
let upgradeLevels = {}; // Track how many times each was bought

// --- INITIALIZATION ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ui = {
  menu: document.getElementById('menu-screen'),
  hud: document.getElementById('hud'),
  upgrade: document.getElementById('upgrade-screen'),
  gameOver: document.getElementById('gameover-screen'),
  upgradeList: document.getElementById('upgrade-container'),
  coinVal: document.getElementById('coin-val'),
  shopCoinVal: document.getElementById('shop-coin-val'),
  closeShopBtn: document.getElementById('close-shop-btn')
};

function init() {
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', e => {
    input.keys[e.code] = true;
    // Shop access via 'E' as requested
    if (e.code === 'KeyE' && gameState === 'PLAYING') {
      showShop();
    }
  });
  window.addEventListener('keyup', e => input.keys[e.code] = false);
  window.addEventListener('mousemove', e => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
  
  document.getElementById('start-btn').onclick = start;
  document.getElementById('restart-btn').onclick = start;
  ui.closeShopBtn.onclick = () => { ui.upgrade.classList.add('hidden'); gameState = 'PLAYING'; };
  
  document.getElementById('high-score-val').textContent = stats.highScore.toLocaleString();
  
  resize();
  requestAnimationFrame(loop);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function start() {
  player = {
    x: canvas.width / 2, y: canvas.height / 2,
    ...JSON.parse(JSON.stringify(CONFIG.PLAYER)),
    maxHp: CONFIG.PLAYER.hp, 
    level: 1, 
    xp: 0, 
    xpToNext: 100, 
    multi: 1
  };
  entities = { enemies: [], bullets: [], gems: [], particles: [], healthCores: [] };
  stats.score = 0;
  stats.coins = 0;
  upgradeLevels = {};
  CONFIG.UPGRADES.forEach(u => upgradeLevels[u.id] = 0);

  timers.spawn = 0;
  timers.fire = 0;
  timers.lastFrame = performance.now();
  
  gameState = 'PLAYING';
  ui.menu.classList.add('hidden');
  ui.gameOver.classList.add('hidden');
  ui.upgrade.classList.add('hidden');
  ui.hud.classList.remove('hidden');
}

// --- LOGIC ---
function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (edge === 0) { x = Math.random() * canvas.width; y = -150; }
  else if (edge === 1) { x = canvas.width + 150; y = Math.random() * canvas.height; }
  else if (edge === 2) { x = Math.random() * canvas.width; y = canvas.height + 150; }
  else { x = -150; y = Math.random() * canvas.height; }

  const baseDifficulty = stats.score / 10000;
  const currentWeights = CONFIG.ENEMIES.map(e => {
    let w = e.weight;
    if (e.type === 'dreadnought') w += baseDifficulty * 5;
    if (e.type === 'overlord') w += baseDifficulty * 1.5;
    return { ...e, activeWeight: w };
  });

  const totalWeight = currentWeights.reduce((acc, curr) => acc + curr.activeWeight, 0);
  let random = Math.random() * totalWeight;
  let proto = currentWeights[0];
  
  for (let i = 0; i < currentWeights.length; i++) {
    if (random < currentWeights[i].activeWeight) {
      proto = currentWeights[i];
      break;
    }
    random -= currentWeights[i].activeWeight;
  }

  const scaling = 1 + (stats.score / 15000);
  
  entities.enemies.push({
    ...proto, x, y,
    hp: proto.hp * scaling,
    maxHp: proto.hp * scaling,
    speed: proto.speed * (1 + (scaling-1) * 0.1)
  });
}

function createBurst(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    entities.particles.push({
      x, y, color,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      life: 1, size: Math.random() * 4 + 1
    });
  }
}

function showShop() {
  gameState = 'LEVELING';
  ui.upgrade.classList.remove('hidden');
  ui.upgradeList.innerHTML = '';
  ui.shopCoinVal.textContent = stats.coins.toLocaleString();
  
  const choices = [...CONFIG.UPGRADES].sort(() => 0.5 - Math.random()).slice(0, 3);
  choices.forEach(upg => {
    const level = upgradeLevels[upg.id];
    // Price Formula: Base * (Level + 1) e.g. 12 -> 24 -> 36 as requested
    const price = upg.basePrice * (level + 1);
    const canAfford = stats.coins >= price;
    
    const card = document.createElement('div');
    card.className = `upgrade-card flex flex-col items-center p-8 rounded-lg ${canAfford ? 'affordable cursor-pointer interactive' : 'expensive'}`;
    card.innerHTML = `
      <div class="text-5xl mb-4">${upg.icon}</div>
      <h3 class="font-orbitron font-bold text-white mb-1 uppercase text-lg text-center">${upg.name}</h3>
      <p class="text-slate-500 text-[10px] text-center font-medium mb-6 h-8">${upg.desc}</p>
      
      <div class="mt-auto flex flex-col items-center gap-2">
        <div class="flex items-center gap-2 text-yellow-400 font-orbitron font-black text-xl">
            <span class="text-xs">●</span> ${price}
        </div>
        <span class="text-[9px] text-slate-600 uppercase font-bold tracking-widest">Upgrade Rank: ${level}</span>
      </div>
    `;
    
    if (canAfford) {
      card.onclick = () => {
        // Decrease coins, not score
        stats.coins -= price;
        upgradeLevels[upg.id]++;
        
        if (upg.id === 'fireRate') player.fireRate *= 0.85;
        if (upg.id === 'damage') player.damage *= 1.3;
        if (upg.id === 'speed') player.speed *= 1.15;
        if (upg.id === 'health') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 50); }
        if (upg.id === 'multi') player.multi++;
        if (upg.id === 'magnet') player.magnet *= 1.6;
        
        ui.upgrade.classList.add('hidden');
        gameState = 'PLAYING';
      };
    }
    
    ui.upgradeList.appendChild(card);
  });
}

function update(dt) {
  if (gameState !== 'PLAYING') return;

  const ndt = Math.min(dt / 16.67, 3);
  
  // Player Movement
  let mx = 0, my = 0;
  if (input.keys['KeyW']) my -= 1;
  if (input.keys['KeyS']) my += 1;
  if (input.keys['KeyA']) mx -= 1;
  if (input.keys['KeyD']) mx += 1;
  if (mx !== 0 || my !== 0) {
    const mag = Math.sqrt(mx * mx + my * my);
    player.x += (mx / mag) * player.speed * ndt;
    player.y += (my / mag) * player.speed * ndt;
  }
  player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
  player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

  // Shooting
  timers.fire += dt;
  if (timers.fire >= player.fireRate) {
    const angle = Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x);
    for (let i = 0; i < player.multi; i++) {
      const spread = (i - (player.multi - 1) / 2) * 0.15;
      entities.bullets.push({
        x: player.x, y: player.y,
        vx: Math.cos(angle + spread) * 12,
        vy: Math.sin(angle + spread) * 12,
        dmg: player.damage, size: 5, color: '#22d3ee'
      });
    }
    timers.fire = 0;
  }

  // Spawning
  timers.spawn += dt;
  const spawnRate = Math.max(120, 1000 - (stats.score / 75));
  if (timers.spawn >= spawnRate) {
    spawnEnemy();
    timers.spawn = 0;
  }

  // Physics & Collision
  entities.bullets = entities.bullets.filter(b => {
    b.x += b.vx * ndt; b.y += b.vy * ndt;
    return b.x > 0 && b.x < canvas.width && b.y > 0 && b.y < canvas.height;
  });

  entities.enemies.forEach((e) => {
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(ang) * e.speed * ndt;
    e.y += Math.sin(ang) * e.speed * ndt;

    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < e.radius + player.size) {
      player.hp -= e.dmg * ndt * 0.08; 
      screenShake = Math.max(screenShake, e.radius / 4);
      if (player.hp <= 0) {
        player.hp = 0;
        gameState = 'GAMEOVER';
        ui.hud.classList.add('hidden');
        ui.gameOver.classList.remove('hidden');
        document.getElementById('final-score-val').textContent = stats.score.toLocaleString();
        if (stats.score > stats.highScore) {
          stats.highScore = stats.score;
          localStorage.setItem('neon-highscore', stats.highScore);
          document.getElementById('high-score-val').textContent = stats.highScore.toLocaleString();
        }
      }
    }

    entities.bullets.forEach((b, bi) => {
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.size) {
        e.hp -= b.dmg;
        entities.bullets.splice(bi, 1);
        if (e.hp <= 0) e.dead = true;
      }
    });
  });

  entities.enemies = entities.enemies.filter(e => {
    if (e.dead) {
      stats.score += Math.floor(e.score);
      const burstCount = Math.min(150, e.radius);
      createBurst(e.x, e.y, e.color, burstCount);
      
      // Health Core Drop Logic - Guaranteed drop for bosses
      if (Math.random() < (e.healDrop || 0.05)) {
        entities.healthCores.push({ x: e.x, y: e.y, size: 8 });
      }

      // Scaled Drops: Bigger enemy = More XP and more Coins
      let drops = 1;
      let xpPerGem = 2;
      let coinPerGem = 10;

      if (e.type === 'overlord') {
        drops = 20; 
        xpPerGem = 15;
        coinPerGem = 100;
      } else if (e.type === 'dreadnought') {
        drops = 10;
        xpPerGem = 8;
        coinPerGem = 40;
      } else if (e.type === 'tank') {
        drops = 3;
        xpPerGem = 4;
        coinPerGem = 20;
      }

      for(let i=0; i<drops; i++) {
        entities.gems.push({ 
            x: e.x + (Math.random()-0.5)*e.radius, 
            y: e.y + (Math.random()-0.5)*e.radius, 
            val: xpPerGem,
            coins: coinPerGem,
            color: '#fcd34d' 
        });
      }
      return false;
    }
    return true;
  });

  // Collectables
  entities.gems.forEach(g => {
    const d = Math.hypot(g.x - player.x, g.y - player.y);
    if (d < player.magnet) {
      const ang = Math.atan2(player.y - g.y, player.x - g.x);
      const magSpeed = Math.max(12, 15 * (player.magnet / 150));
      g.x += Math.cos(ang) * magSpeed * ndt;
      g.y += Math.sin(ang) * magSpeed * ndt;
    }
    if (d < player.size + 15) {
      player.xp += g.val;
      stats.coins += g.coins;
      g.taken = true;
      if (player.xp >= player.xpToNext) {
        player.level++;
        player.xp = 0;
        player.xpToNext = Math.floor(player.xpToNext * 1.35);
        showShop();
      }
    }
  });
  entities.gems = entities.gems.filter(g => !g.taken);

  // Health Collection
  entities.healthCores.forEach(hc => {
    const d = Math.hypot(hc.x - player.x, hc.y - player.y);
    if (d < player.magnet) {
        const ang = Math.atan2(player.y - hc.y, player.x - hc.x);
        hc.x += Math.cos(ang) * 10 * ndt;
        hc.y += Math.sin(ang) * 10 * ndt;
    }
    if (d < player.size + 15) {
        player.hp = Math.min(player.maxHp, player.hp + (player.maxHp * 0.25));
        hc.taken = true;
        createBurst(player.x, player.y, '#22c55e', 20); // Green healing burst
    }
  });
  entities.healthCores = entities.healthCores.filter(hc => !hc.taken);

  entities.particles.forEach(p => {
    p.x += p.vx * ndt; p.y += p.vy * ndt;
    p.life -= 0.015 * ndt;
  });
  entities.particles = entities.particles.filter(p => p.life > 0);

  // HUD sync
  document.getElementById('score-val').textContent = stats.score.toLocaleString();
  ui.coinVal.textContent = stats.coins.toLocaleString();
  document.getElementById('level-val').textContent = `Rank ${String(player.level).padStart(2, '0')}`;
  document.getElementById('hp-bar-inner').style.width = `${(player.hp / player.maxHp) * 100}%`;
  document.getElementById('xp-bar-inner').style.width = `${(player.xp / player.xpToNext) * 100}%`;
  
  if (screenShake > 0) screenShake -= 0.6 * ndt;
}

// --- RENDERING ---
function drawPolygon(x, y, radius, sides, angle = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = angle + (i * Math.PI * 2) / sides;
    ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  ctx.closePath();
}

function drawCross(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size, y - size/3);
    ctx.lineTo(x - size/3, y - size/3);
    ctx.lineTo(x - size/3, y - size);
    ctx.lineTo(x + size/3, y - size);
    ctx.lineTo(x + size/3, y - size/3);
    ctx.lineTo(x + size, y - size/3);
    ctx.lineTo(x + size, y + size/3);
    ctx.lineTo(x + size/3, y + size/3);
    ctx.lineTo(x + size/3, y + size);
    ctx.lineTo(x - size/3, y + size);
    ctx.lineTo(x - size/3, y + size/3);
    ctx.lineTo(x - size, y + size/3);
    ctx.closePath();
}

function draw() {
  ctx.save();
  if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
  ctx.lineWidth = 1;
  const spacing = 100;
  const ox = player ? -player.x % spacing : 0;
  const oy = player ? -player.y % spacing : 0;
  for (let x = ox; x < canvas.width; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = oy; y < canvas.height; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (gameState === 'MENU' || !player) {
    ctx.restore();
    return;
  }

  // Health Cores
  entities.healthCores.forEach(hc => {
    ctx.fillStyle = '#22c55e';
    ctx.shadowBlur = 15; ctx.shadowColor = '#22c55e';
    drawCross(hc.x, hc.y, hc.size + Math.sin(performance.now() * 0.01) * 2);
    ctx.fill();
  });

  // Gems
  entities.gems.forEach(g => {
    ctx.fillStyle = g.color || '#fcd34d';
    ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath(); ctx.arc(g.x, g.y, 4, 0, Math.PI * 2); ctx.fill();
  });

  // Particles
  entities.particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Bullets
  entities.bullets.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.shadowBlur = 15; ctx.shadowColor = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
  });

  // Enemies
  entities.enemies.forEach(e => {
    ctx.fillStyle = e.color;
    ctx.shadowBlur = e.radius > 50 ? 50 : 15; 
    ctx.shadowColor = e.color;
    drawPolygon(e.x, e.y, e.radius, e.sides, performance.now() * (e.type === 'overlord' ? 0.0003 : 0.002));
    ctx.fill();
    
    if (e.hp < e.maxHp) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const bw = e.radius * 2;
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 15, bw, 6);
      ctx.fillStyle = (e.radius > 50) ? '#ffffff' : '#ef4444';
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 15, bw * (e.hp / e.maxHp), 6);
    }
  });

  // Player
  const pAngle = Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(pAngle + Math.PI / 2);
  ctx.fillStyle = '#22d3ee';
  ctx.shadowBlur = 25; ctx.shadowColor = '#22d3ee';
  ctx.beginPath();
  ctx.moveTo(0, -player.size * 1.2);
  ctx.lineTo(-player.size, player.size);
  ctx.lineTo(player.size, player.size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function loop(time) {
  if (timers.lastFrame === 0) timers.lastFrame = time;
  const dt = time - timers.lastFrame;
  timers.lastFrame = time;
  
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

init();