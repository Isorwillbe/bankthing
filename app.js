/* ================================================
   FISCALCORE™ APP LOGIC
   "Where corporate compliance meets jar violence."
   ================================================ */

// ===== MATTER.JS SETUP =====
let MatterJS;

// ===== STATE =====
const state = {
    balance: 500.00,
    jarBalance: 0,
    jarIntact: true,
    jarsSmashed: 0,
    hammerMode: false,
    shards: [],
    shardPositions: [],
    coinsInJar: [],
    activeCoins: [],
    spendingCoins: [],
    transactions: [],
    utilities: [
        { id: 1, name: 'Electric Company', amount: 85.00, dueIn: 30, overdue: false, paid: false },
        { id: 2, name: 'Water Works', amount: 45.00, dueIn: 25, overdue: false, paid: false },
        { id: 3, name: 'Internet & Cable', amount: 120.00, dueIn: 20, overdue: false, paid: false },
        { id: 4, name: 'Gas & Heating', amount: 65.00, dueIn: 15, overdue: false, paid: false },
        { id: 5, name: 'Trash Collection', amount: 25.00, dueIn: 5, overdue: false, paid: false },
        // Rent spawns dynamically every 2 mins
    ],
    nextUtilityId: 6,
    rentTimer: null,
    reminderTimers: [],
    reminderCount: 0,
    dismissedReminders: 0,
    jarBoughtCount: 0,
    engine: null,
    render: null,
    runner: null,
    physicsWidth: 0,
    physicsHeight: 0,
    jarBody: null,
    jarWallBodies: [],
    floorBody: null,
    wallBodies: [],
    coinBodies: [],
    shardBodies: [],
    smashParticles: [],
    grabConstraint: null,
    // Shard damage
    hasGloves: false,
    health: 100,
    lastShardDamage: 0,
    // Shard wound particles
    woundParticles: [],
    // Mechanical arm state
    arm: {
        active: false,
        targetCoin: null,
        phase: 'idle', // idle, reaching, grabbing, dragging, dropping, retracting
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        gripOpen: true,
        armBaseX: 0,
        armBaseY: 0,
        elbowX: 0,
        elbowY: 0,
        clawX: 0,
        clawY: 0,
        segments: [],
        color: '#ff4444',
        cooldown: 0,
        animProgress: 0,
    },
};

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    // Destructure Matter.js after it's loaded
    const { Engine, Render, Runner, Bodies, Body, Composite, Events, Mouse, MouseConstraint, Constraint, Vector } = Matter;
    MatterJS = { Engine, Render, Runner, Bodies, Body, Composite, Events, Mouse, MouseConstraint, Constraint, Vector };
    
    updateDate();
    updateUI();
    renderUtilities();
    // Small delay to ensure container is painted, retry if needed
    let initAttempts = 0;
    const tryInit = () => {
        initAttempts++;
        const container = $('#jar-container');
        if (container.clientWidth > 50 && container.clientHeight > 50) {
            initPhysics();
        } else if (initAttempts < 15) {
            setTimeout(tryInit, 200);
        } else {
            // Give up waiting, force init with defaults
            console.warn('FISCALCORE: Container still 0-size, forcing physics init');
            initPhysics();
        }
    };
    setTimeout(tryInit, 100);
    startReminderSystem();
    startRentSpawner();
    bindEvents();
    addTransaction('Initial Deposit', 500.00);
});

// ===== DATE =====
function updateDate() {
    const d = new Date();
    $('#header-date').textContent = d.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
}

// ===== UI UPDATE =====
function updateUI() {
    $('#balance-display').textContent = `$${state.balance.toFixed(2)}`;
    $('#jar-balance-display').textContent = `$${state.jarBalance.toFixed(2)}`;
    $('#jars-smashed').textContent = state.jarsSmashed;
    
    const jarStatus = $('#jar-status');
    if (state.jarIntact) {
        jarStatus.textContent = state.jarBalance > 0 
            ? `Jar is intact. $${state.jarBalance.toFixed(2)} inside.`
            : 'Jar is intact. Add some money!';
        jarStatus.style.color = '#718096';
    } else {
        jarStatus.textContent = state.shards.length > 0 
            ? `Jar is SMASHED! ${state.shards.length} shards remain. Collect your coins!`
            : 'Jar is SMASHED! Grab your coins!';
        jarStatus.style.color = '#e53e3e';
    }

    // Shard info
    const totalShards = state.shardPositions.length;
    const placedShards = state.shardPositions.filter(s => s.placed).length;
    $('#shard-count').textContent = state.shards.length;
    $('#shard-placed').textContent = placedShards;
    $('#shard-total').textContent = totalShards;
    
    if (totalShards > 0 && placedShards < totalShards) {
        $('#reassemble-btn').classList.remove('hidden');
        $('#shard-hint').textContent = state.hasGloves ? 'Drag shards to the jar outline to reassemble!' : 'Drag shards to reassemble! CAREFUL - they\'re SHARP! 🧤=$600';
    } else if (totalShards > 0 && placedShards >= totalShards) {
        $('#reassemble-btn').classList.remove('hidden');
        $('#shard-hint').textContent = 'All shards placed! Click Reassemble!';
    } else {
        $('#reassemble-btn').classList.add('hidden');
        $('#shard-hint').textContent = state.jarIntact ? 'Jar is whole and happy.' : 'Smash a jar to collect shards!';
    }
    
    // Gloves button
    const glovesBtn = $('#buy-gloves-btn');
    if (glovesBtn) {
        if (state.hasGloves) {
            glovesBtn.textContent = '🧤 Gloves Equipped!';
            glovesBtn.style.opacity = '0.5';
            glovesBtn.disabled = true;
        } else {
            glovesBtn.textContent = '🧤 Buy Gloves ($600)';
            glovesBtn.style.opacity = state.balance >= 600 ? '1' : '0.5';
            glovesBtn.disabled = false;
        }
    }
    
    // Health display in sidebar
    const healthDisplay = $('#health-display');
    if (healthDisplay) {
        healthDisplay.textContent = `${state.health}/100`;
        healthDisplay.style.color = state.health > 60 ? '#38a169' : (state.health > 30 ? '#d69e2e' : '#e53e3e');
    }
    const glovesStatus = $('#gloves-status');
    if (glovesStatus) {
        glovesStatus.textContent = state.hasGloves ? '🧤 Equipped' : 'None (shards cut you!)';
        glovesStatus.style.color = state.hasGloves ? '#38a169' : '#e53e3e';
    }

    // Overdue count
    const overdue = state.utilities.filter(u => u.overdue && !u.paid).length;
    $('#overdue-count').textContent = `${overdue} Overdue`;
    $('#reminder-count').textContent = `${state.utilities.filter(u => !u.paid).length} Active`;

    // Jar instructions
    if (state.hammerMode) {
        $('#jar-instructions').textContent = '🔨 HAMMER MODE ACTIVE! Click the jar to SMASH it!';
        $('#jar-instructions').style.color = '#e53e3e';
        $('#jar-instructions').style.fontWeight = '700';
    } else if (!state.jarIntact) {
        $('#jar-instructions').textContent = 'Jar SMASHED! Drag coins far away to spend, or drag shards to the dotted outline to reassemble. Double-click coins to quick-spend.';
        $('#jar-instructions').style.color = '#d69e2e';
    } else {
        $('#jar-instructions').textContent = 'Add money to your jar. When you need it, grab the hammer and SMASH it open!';
        $('#jar-instructions').style.color = '#718096';
    }

    // Buy jar button
    if (state.jarIntact) {
        $('#buy-jar-btn').style.opacity = '0.5';
        $('#buy-jar-btn').title = 'Jar is still intact!';
    } else {
        $('#buy-jar-btn').style.opacity = '1';
        $('#buy-jar-btn').title = 'Buy New Jar - $15';
    }
}

// ===== TRANSACTIONS =====
function addTransaction(desc, amount) {
    state.transactions.unshift({
        desc,
        amount,
        date: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
    renderTransactions();
}

function renderTransactions() {
    const list = $('#transaction-list');
    if (state.transactions.length === 0) {
        list.innerHTML = '<div class="transaction-empty">No transactions yet</div>';
        return;
    }
    list.innerHTML = state.transactions.slice(0, 20).map(t => `
        <div class="transaction-item">
            <div>
                <div class="transaction-desc">${t.desc}</div>
                <div style="font-size:10px;color:#718096">${t.date}</div>
            </div>
            <div class="transaction-amount ${t.amount >= 0 ? 'positive' : 'negative'}">
                ${t.amount >= 0 ? '+' : ''}$${Math.abs(t.amount).toFixed(2)}
            </div>
        </div>
    `).join('');
}

// ===== UTILITIES =====
function renderUtilities() {
    const list = $('#utility-list');
    list.innerHTML = state.utilities.map(u => `
        <div class="utility-item ${u.overdue && !u.paid ? 'utility-overdue' : ''} ${u.paid ? 'utility-paid' : ''}">
            <div>
                <div class="utility-name">${u.name}</div>
                <div class="utility-due">${u.paid ? '✓ PAID' : (u.overdue ? '⚠ OVERDUE!' : `Due in ${u.dueIn}s`)}</div>
            </div>
            <div>
                <span class="utility-amount">$${u.amount.toFixed(2)}</span>
                ${!u.paid ? `<button class="utility-pay-btn" onclick="payUtility(${u.id})">Pay</button>` : ''}
            </div>
        </div>
    `).join('');
}

function payUtility(id) {
    const util = state.utilities.find(u => u.id === id);
    if (!util || util.paid) return;
    
    if (state.balance < util.amount) {
        alert(`Insufficient funds! You need $${util.amount.toFixed(2)} but only have $${state.balance.toFixed(2)}. Maybe smash that penny jar?`);
        return;
    }
    
    state.balance -= util.amount;
    util.paid = true;
    util.overdue = false;
    addTransaction(`Paid: ${util.name}`, -util.amount);
    renderUtilities();
    updateUI();
}

// ===== DEPOSIT =====
function depositToAccount() {
    const input = $('#deposit-amount');
    const amount = parseFloat(input.value);
    if (isNaN(amount) || amount <= 0) return;
    
    state.balance += amount;
    addTransaction('Deposit to Account', amount);
    input.value = '';
    updateUI();
}

function depositToJar() {
    const input = $('#deposit-amount');
    const amount = parseFloat(input.value);
    if (isNaN(amount) || amount <= 0) return;
    
    if (state.balance < amount) {
        alert('Not enough in your account!');
        return;
    }
    
    if (!state.jarIntact) {
        alert('The jar is smashed! Reassemble it or buy a new one first.');
        return;
    }
    
    state.balance -= amount;
    state.jarBalance += amount;
    addCoinToJar(amount);
    addTransaction(`Added to Penny Jar`, -amount);
    input.value = '';
    updateUI();
}

function addCoinToJar(amount) {
    // Split coins over $200 into multiple smaller coins
    if (amount > 200) {
        let remaining = amount;
        const coinValues = [];
        while (remaining > 0) {
            // Create coins of varying sizes (prefer $50-100 chunks)
            if (remaining > 100) {
                const chunk = 50 + Math.random() * 50; // $50-$100
                coinValues.push(Math.min(chunk, remaining));
                remaining -= chunk;
            } else {
                coinValues.push(remaining);
                remaining = 0;
            }
        }
        // Add each sub-coin with a slight delay for visual effect
        coinValues.forEach((val, i) => {
            setTimeout(() => {
                createSingleCoin(val);
                state.coinsInJar.push({ value: val });
            }, i * 200);
        });
        return;
    }
    
    // Create a visual coin in the jar
    state.coinsInJar.push({ value: amount });
    createSingleCoin(amount);
}

function createSingleCoin(amount) {
    if (!state.engine) return;
    
    const canvas = $('#jar-canvas');
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Coin radius based on value tier
    let coinRadius;
    if (amount >= 50) {
        coinRadius = 22 + Math.min(amount / 50, 5); // big gold
    } else if (amount >= 25) {
        coinRadius = 16 + Math.min(amount / 25, 4); // medium silver
    } else {
        coinRadius = 10 + Math.min(amount / 10, 6); // small penny
    }
    
    // Spawn above the jar, slightly off-screen top
    const coinX = cw / 2 + (Math.random() - 0.5) * 60;
    const coinY = -30;
    
    const coin = Matter.Bodies.circle(coinX, coinY, coinRadius, {
        restitution: 0.5,
        friction: 0.4,
        density: 0.003,
        label: 'coin',
        render: {
            fillStyle: getCoinColor(amount),
            strokeStyle: getCoinStroke(amount),
            lineWidth: 2,
        },
        coinValue: amount,
        coinTier: amount >= 50 ? 'gold' : (amount >= 25 ? 'silver' : 'penny'),
    });
    
    Matter.Composite.add(state.engine.world, coin);
    state.coinBodies.push(coin);
    
    // Activate the arm to push this coin toward the jar
    activateArmForCoin(coin);
}

function getCoinColor(amount) {
    if (amount >= 50) return '#FFD700'; // gold for $50+
    if (amount >= 25) return '#C0C0C0'; // silver for $25-$49.99
    return '#B87333'; // copper/penny for under $25
}

function getCoinStroke(amount) {
    if (amount >= 50) return '#b8860b'; // gold outline
    if (amount >= 25) return '#808080'; // silver outline
    return '#8B4513'; // penny outline
}

function getCoinLabel(amount) {
    if (amount >= 50) return 'GOLD';
    if (amount >= 25) return 'SILVER';
    return 'PENNY';
}

// ===== PHYSICS ENGINE =====
function initPhysics() {
    const { Engine, Render, Runner, Bodies, Body, Composite, Events, Mouse, MouseConstraint, Constraint, Vector } = Matter;
    
    const canvas = $('#jar-canvas');
    const container = $('#jar-container');
    
    const cw = Math.max(container.clientWidth, 300);
    const ch = Math.max(container.clientHeight, 400);
    
    console.log('🎨 Initializing physics! Container:', container.clientWidth, 'x', container.clientHeight);
    console.log('🎨 Canvas will be:', cw, 'x', ch);
    
    // Set canvas display size AND internal buffer size explicitly
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    state.engine = Engine.create({
        gravity: { x: 0, y: 1 }
    });

    state.render = Render.create({
        canvas: canvas,
        engine: state.engine,
        options: {
            width: cw,
            height: ch,
            wireframes: false,
            background: '#e8edf2', // Solid background so we can see rendering
            pixelRatio: 1,
        }
    });

    console.log('✅ Matter.js renderer created with background #e8edf2');

    // Walls
    const wallThickness = 30;
    // Visible floor with a shelf/surface look - physics body will be drawn by Matter.js
    const floorSurfaceY = ch - 22; // top of visible floor
    const floor = Bodies.rectangle(cw / 2, floorSurfaceY + wallThickness/2, cw + 100, wallThickness, {
        isStatic: true,
        render: { 
            fillStyle: '#4a5568',
            visible: true // Make sure floor is VISIBLE
        },
        label: 'floor'
    });
    
    const leftWall = Bodies.rectangle(-wallThickness/2, ch/2, wallThickness, ch * 2, {
        isStatic: true,
        render: { visible: false },
        label: 'wall'
    });
    
    const rightWall = Bodies.rectangle(cw + wallThickness/2, ch/2, wallThickness, ch * 2, {
        isStatic: true,
        render: { visible: false },
        label: 'wall'
    });

    state.floorBody = floor;
    state.wallBodies = [leftWall, rightWall];
    
    Composite.add(state.engine.world, [floor, leftWall, rightWall]);
    console.log('✅ Floor created at y=', floorSurfaceY, 'walls added');

    // Create jar walls (glass jar shape)
    createJarBodies(cw, ch);
    console.log('✅ Jar created at:', state.jarBody?.x, state.jarBody?.y, 'Size:', state.jarBody?.w, 'x', state.jarBody?.h);

    // Mouse constraint for dragging
    const mouse = Mouse.create(canvas);
    const mouseConstraint = MouseConstraint.create(state.engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.2,
            render: { visible: false }
        }
    });
    
    // Prevent default browser drag on canvas
    canvas.addEventListener('selectstart', (e) => e.preventDefault());
    
    Composite.add(state.engine.world, mouseConstraint);
    state.render.mouse = mouse;

    // Handle shard touch damage on mousedown
    canvas.addEventListener('mousedown', (e) => {
        if (state.jarIntact || state.hasGloves) return;
        // Use Matter.js mouse position which already handles pixel ratio
        const mPos = mouse.position;
        if (!mPos || mPos.x === 0 && mPos.y === 0) return;
        
        // Check if clicking on a shard
        for (const shard of state.shardBodies) {
            if (shard.isStatic) continue; // placed shards don't hurt
            const dist = Math.sqrt(
                Math.pow(mPos.x - shard.position.x, 2) +
                Math.pow(mPos.y - shard.position.y, 2)
            );
            if (dist < 35) {
                damageFromShard();
                break;
            }
        }
    });

    // Handle coin dragging for spending
    Events.on(mouseConstraint, 'startdrag', (e) => {
        if (e.body && e.body.label === 'coin' && !state.jarIntact) {
            state.grabConstraint = e.body;
        }
        // Shard touch damage on grab
        if (e.body && e.body.label === 'shard' && !state.jarIntact && !state.hasGloves && !e.body.isStatic) {
            damageFromShard();
        }
    });

    Events.on(mouseConstraint, 'enddrag', (e) => {
        if (e.body && e.body.label === 'coin' && !state.jarIntact) {
            // Coin was dropped - check if it's outside the jar area (spending it)
            const pos = e.body.position;
            const j = state.jarBody;
            if (j) {
                const distFromJar = Math.sqrt(
                    Math.pow(pos.x - j.x, 2) + Math.pow(pos.y - j.y, 2)
                );
                if (distFromJar > j.w * 1.5) {
                    // Coin was dragged far from jar - spend it!
                    handleCoinSpend(e.body);
                }
            }
        }
        if (e.body && e.body.label === 'shard' && !state.jarIntact) {
            // Check if shard is near its target - auto-snap
            const shardIdx = state.shardBodies.indexOf(e.body);
            if (shardIdx >= 0 && state.shardPositions[shardIdx] && !state.shardPositions[shardIdx].placed) {
                const sp = state.shardPositions[shardIdx];
                const dist = Math.sqrt(
                    Math.pow(e.body.position.x - sp.targetX, 2) +
                    Math.pow(e.body.position.y - sp.targetY, 2)
                );
                if (dist < 55) {
                    Body.setPosition(e.body, { x: sp.targetX, y: sp.targetY });
                    Body.setVelocity(e.body, { x: 0, y: 0 });
                    Body.setStatic(e.body);
                    e.body.render.fillStyle = 'rgba(100, 220, 255, 0.8)';
                    // Make placed shard smooth, not spiky
                    e.body.render.strokeStyle = '#4fc3f7';
                    sp.placed = true;
                    playSnapSound();
                    updateUI();
                    
                    // Check if all shards placed
                    if (state.shardPositions.every(s => s.placed)) {
                        setTimeout(() => reassembleJar(), 500);
                    }
                }
            }
            // Shard touch damage on drop too
            if (!e.body.isStatic && !state.hasGloves) {
                damageFromShard();
            }
        }
        state.grabConstraint = null;
    });

    // Click handler for hammer
    Events.on(mouseConstraint, 'mousedown', (e) => {
        // DEBUG: Show click position
        console.log('🖱️ Click at:', e.mouse.position.x, e.mouse.position.y);
        
        if (state.hammerMode && state.jarIntact) {
            // Check if clicking near the jar
            const pos = e.mouse.position;
            const jarCenter = getJarCenter();
            console.log('🔨 Hammer mode! Jar center:', jarCenter);
            if (jarCenter) {
                const dist = Vector.magnitude(Vector.sub(pos, jarCenter));
                console.log('🔨 Distance from jar:', dist);
                if (dist < 120) {
                    console.log('🔨 SMASHING JAR!');
                    smashJar();
                }
            }
        }
    });

    // Initialize arm base position
    state.arm.armBaseX = cw - 40;
    state.arm.armBaseY = 20;

    // Store physics-space dimensions for rendering
    state.physicsWidth = cw;
    state.physicsHeight = ch;

    // Start arm animation loop
    startArmLoop();

    // Custom render loop
    Events.on(state.render, 'afterRender', () => {
        const ctx = state.render.context;
        const pw = state.physicsWidth;
        const ph = state.physicsHeight;
        
        // DEBUG: Draw coordinate system markers
        ctx.save();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        // Draw axes
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(50, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 50);
        ctx.stroke();
        ctx.fillStyle = '#ff0000';
        ctx.font = '10px monospace';
        ctx.fillText(`(0,0) Physics: ${pw}x${ph}`, 5, 10);
        ctx.restore();
        
        // Draw the visible floor surface
        drawFloorSurface(ctx, pw, ph);
        
        // Draw jar outline (glass)
        if (state.jarIntact) {
            drawJarOutline(ctx, pw, ph);
            
            // DEBUG: Draw jar physics walls as RED boxes
            ctx.save();
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            state.jarWallBodies.forEach((wall, i) => {
                const bounds = wall.bounds;
                ctx.strokeRect(bounds.min.x, bounds.min.y, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
                ctx.fillStyle = '#ff0000';
                ctx.font = '9px monospace';
                ctx.fillText(`Wall ${i}`, bounds.min.x, bounds.min.y - 3);
            });
            // Draw jar center
            const j = state.jarBody;
            if (j) {
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                ctx.arc(j.x, j.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#00ff00';
                ctx.font = '10px monospace';
                ctx.fillText(`Jar center: (${j.x.toFixed(0)}, ${j.y.toFixed(0)})`, j.x + 10, j.y - 10);
                ctx.fillText(`Jar size: ${j.w}x${j.h}`, j.x + 10, j.y + 5);
            }
            ctx.restore();
        } else {
            drawShardOutlines(ctx, pw, ph);
            
            // DEBUG: Draw shard positions
            ctx.save();
            ctx.fillStyle = '#ff00ff';
            state.shardBodies.forEach((shard, i) => {
                const pos = shard.position;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ff00ff';
                ctx.font = '8px monospace';
                ctx.fillText(`S${i}`, pos.x + 5, pos.y - 5);
                ctx.fillStyle = '#ff00ff';
            });
            ctx.restore();
        }
        
        // Draw coin values and tier labels
        state.coinBodies.forEach(coin => {
            if (coin.label === 'coin') {
                const pos = coin.position;
                const val = coin.coinValue || 0;
                const tier = coin.coinTier || (val >= 50 ? 'gold' : (val >= 25 ? 'silver' : 'penny'));
                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.rotate(coin.angle);
                
                // Dollar amount
                ctx.fillStyle = tier === 'gold' ? '#654321' : (tier === 'silver' ? '#333' : '#3d1c00');
                ctx.font = `bold ${Math.max(7, coin.circleRadius * 0.45)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`$${val.toFixed(0)}`, 0, -2);
                
                // Tier label below amount
                ctx.font = `${Math.max(6, coin.circleRadius * 0.3)}px Arial`;
                ctx.fillStyle = tier === 'gold' ? 'rgba(101,67,33,0.7)' : (tier === 'silver' ? 'rgba(50,50,50,0.6)' : 'rgba(61,28,0,0.7)');
                ctx.fillText(tier.toUpperCase(), 0, coin.circleRadius * 0.35);
                ctx.restore();
            }
        });

        // Draw the mechanical arm
        drawMechanicalArm(ctx, pw, ph);

        // Draw smash particles
        state.smashParticles = state.smashParticles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3;
            p.life -= 0.02;
            if (p.life <= 0) return false;
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
            ctx.restore();
            return true;
        });

        // Draw wound particles (red blood droplets from shard cuts)
        state.woundParticles = state.woundParticles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            p.life -= 0.03;
            if (p.life <= 0) return false;
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = '#cc0000';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 + (1 - p.life) * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return true;
        });

        // Draw health bar overlay (top-left of canvas)
        drawHealthBar(ctx, pw);
        
        // Draw gloves indicator
        if (state.hasGloves) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(8, 28, 70, 16);
            ctx.fillStyle = '#44ff44';
            ctx.font = '10px monospace';
            ctx.fillText('🧤 GLOVED', 12, 40);
            ctx.restore();
        }
    });

    Render.run(state.render);
    state.runner = Runner.create();
    Runner.run(state.runner, state.engine);
    
    console.log('🚀 Physics engine and renderer RUNNING!');
    console.log('📦 World bodies:', Composite.allBodies(state.engine.world).length);
    console.log('🎨 Canvas:', canvas.width, 'x', canvas.height, 'Display:', canvas.style.width, 'x', canvas.style.height);

    // Resize handler
    window.addEventListener('resize', () => {
        const ncw = container.clientWidth || 300;
        const nch = container.clientHeight || 400;
        canvas.width = ncw;
        canvas.height = nch;
        state.physicsWidth = ncw;
        state.physicsHeight = nch;
        Render.setSize(state.render, ncw, nch);
    });
}

function createJarBodies(cw, ch) {
    // Remove old jar walls
    if (state.jarWallBodies.length > 0) {
        Composite.remove(state.engine.world, state.jarWallBodies);
    }
    state.jarWallBodies = [];

    const jarW = 140;
    const jarH = 200;
    const jarX = cw / 2;
    // Position jar so its bottom sits right on the visible floor (ch - 22)
    const jarY = (ch - 22) - jarH / 2 - 5; // 5px above floor
    const wallW = 15;

    // Jar bottom - make VISIBLE so we can see it
    const bottom = Bodies.rectangle(jarX, jarY + jarH/2, jarW, wallW, {
        isStatic: true,
        render: { 
            fillStyle: 'rgba(100, 180, 255, 0.4)',
            visible: true 
        },
        label: 'jarWall',
        chamfer: { radius: 3 }
    });
    
    // Jar left wall - make VISIBLE
    const left = Bodies.rectangle(jarX - jarW/2 + wallW/2, jarY, wallW, jarH, {
        isStatic: true,
        render: { 
            fillStyle: 'rgba(100, 180, 255, 0.4)',
            visible: true 
        },
        label: 'jarWall',
        angle: 0.05,
    });
    
    // Jar right wall - make VISIBLE
    const right = Bodies.rectangle(jarX + jarW/2 - wallW/2, jarY, wallW, jarH, {
        isStatic: true,
        render: { 
            fillStyle: 'rgba(100, 180, 255, 0.4)',
            visible: true 
        },
        label: 'jarWall',
        angle: -0.05,
    });

    state.jarWallBodies = [bottom, left, right];
    Composite.add(state.engine.world, state.jarWallBodies);
    state.jarBody = { x: jarX, y: jarY, w: jarW, h: jarH };
}

function getJarCenter() {
    if (state.jarBody) {
        return { x: state.jarBody.x, y: state.jarBody.y };
    }
    return null;
}

function drawJarOutline(ctx, cw, ch) {
    const j = state.jarBody;
    if (!j) return;

    ctx.save();
    
    // ---- Jar floor / bottom shelf ----
    ctx.fillStyle = 'rgba(100, 160, 220, 0.25)';
    ctx.fillRect(j.x - j.w/2 + 5, j.y + j.h/2 - 4, j.w - 10, 4);
    // Pixel pattern on jar floor
    for (let x = j.x - j.w/2 + 8; x < j.x + j.w/2 - 8; x += 8) {
        ctx.fillStyle = 'rgba(120, 180, 240, 0.15)';
        ctx.fillRect(x, j.y + j.h/2 - 4, 4, 4);
    }
    
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    
    // Jar body
    ctx.beginPath();
    // Left side
    ctx.moveTo(j.x - j.w/2 - 10, j.y - j.h/2);
    ctx.quadraticCurveTo(j.x - j.w/2 - 15, j.y, j.x - j.w/2 + 5, j.y + j.h/2);
    // Bottom
    ctx.lineTo(j.x + j.w/2 - 5, j.y + j.h/2);
    // Right side
    ctx.quadraticCurveTo(j.x + j.w/2 + 15, j.y, j.x + j.w/2 + 10, j.y - j.h/2);
    // Rim
    ctx.lineTo(j.x + j.w/2 + 20, j.y - j.h/2 - 10);
    ctx.lineTo(j.x + j.w/2 + 25, j.y - j.h/2 - 10);
    ctx.moveTo(j.x - j.w/2 - 10, j.y - j.h/2);
    ctx.lineTo(j.x - j.w/2 - 20, j.y - j.h/2 - 10);
    ctx.lineTo(j.x - j.w/2 - 25, j.y - j.h/2 - 10);
    ctx.stroke();

    // Glass fill
    ctx.fillStyle = 'rgba(150, 210, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(j.x - j.w/2 - 10, j.y - j.h/2);
    ctx.quadraticCurveTo(j.x - j.w/2 - 15, j.y, j.x - j.w/2 + 5, j.y + j.h/2);
    ctx.lineTo(j.x + j.w/2 - 5, j.y + j.h/2);
    ctx.quadraticCurveTo(j.x + j.w/2 + 15, j.y, j.x + j.w/2 + 10, j.y - j.h/2);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(100, 150, 200, 0.5)';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PENNY JAR', j.x, j.y + j.h/2 + 20);
    
    ctx.restore();
}

function drawShardOutlines(ctx, cw, ch) {
    const j = state.jarBody;
    if (!j) return;

    // Draw faint jar outline as reassembly guide
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 8]);
    
    ctx.beginPath();
    ctx.moveTo(j.x - j.w/2 - 10, j.y - j.h/2);
    ctx.quadraticCurveTo(j.x - j.w/2 - 15, j.y, j.x - j.w/2 + 5, j.y + j.h/2);
    ctx.lineTo(j.x + j.w/2 - 5, j.y + j.h/2);
    ctx.quadraticCurveTo(j.x + j.w/2 + 15, j.y, j.x + j.w/2 + 10, j.y - j.h/2);
    ctx.stroke();

    // Draw shard placement zones
    state.shardPositions.forEach((sp, i) => {
        if (!sp.placed) {
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.arc(sp.targetX, sp.targetY, 20, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    ctx.restore();
}

// ===== FLOOR SURFACE =====
function drawFloorSurface(ctx, cw, ch) {
    const floorTop = ch - 22;
    ctx.save();
    
    // Main floor surface
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(0, floorTop, cw, 22);
    
    // Top edge highlight
    ctx.fillStyle = '#718096';
    ctx.fillRect(0, floorTop, cw, 2);
    
    // Pixel texture pattern on floor
    for (let x = 0; x < cw; x += 16) {
        ctx.fillStyle = x % 32 === 0 ? '#5a6578' : '#3d4a5c';
        ctx.fillRect(x, floorTop + 2, 16, 20);
    }
    
    // Floor label
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FISCALCORE™ SURFACE', cw / 2, floorTop + 14);
    
    ctx.restore();
}

// ===== HEALTH BAR =====
function drawHealthBar(ctx, cw) {
    const barW = 100;
    const barH = 14;
    const barX = 8;
    const barY = 8;
    const hp = state.health / 100;
    
    ctx.save();
    
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, barY, barW, barH);
    
    // Health fill
    let hpColor;
    if (hp > 0.6) hpColor = '#44ff44';
    else if (hp > 0.3) hpColor = '#ffaa00';
    else hpColor = '#ff3333';
    
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX + 1, barY + 1, (barW - 2) * hp, barH - 2);
    
    // Low health pulsing
    if (hp <= 0.3 && hp > 0) {
        ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 150) * 0.3;
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(barX + 1, barY + 1, (barW - 2) * hp, barH - 2);
        ctx.globalAlpha = 1;
    }
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HP ${state.health}/100`, barX + barW / 2, barY + 11);
    
    ctx.restore();
}

// ===== MECHANICAL PIXEL ARM =====
function activateArmForCoin(coin) {
    if (!state.jarIntact) return; // Arm only works when jar is intact
    if (state.arm.phase !== 'idle') return; // Arm is busy
    
    state.arm.active = true;
    state.arm.targetCoin = coin;
    state.arm.phase = 'reaching';
    state.arm.animProgress = 0;
    state.arm.gripOpen = true;
}

function startArmLoop() {
    setInterval(() => {
        updateArm();
    }, 16); // ~60fps
}

function updateArm() {
    const arm = state.arm;
    if (!arm.active) return;
    
    const canvas = $('#jar-canvas');
    const cw = canvas.width;
    const ch = canvas.height;
    const j = state.jarBody;
    if (!j) return;
    
    const { Body: MBody, Composite: MComposite } = Matter;
    
    arm.animProgress += 0.02;
    
    switch (arm.phase) {
        case 'reaching': {
            // Arm extends toward the coin
            if (!arm.targetCoin || arm.targetCoin.label !== 'coin') {
                arm.phase = 'idle';
                arm.active = false;
                return;
            }
            const coinPos = arm.targetCoin.position;
            arm.targetX = coinPos.x;
            arm.targetY = coinPos.y;
            arm.armBaseX = cw - 30;
            arm.armBaseY = 10;
            
            if (arm.animProgress >= 1) {
                arm.phase = 'grabbing';
                arm.animProgress = 0;
                arm.gripOpen = false;
            }
            break;
        }
        case 'grabbing': {
            // Close the claw on the coin
            if (arm.animProgress >= 0.5) {
                arm.gripOpen = false;
                // Apply a gentle force to the coin toward the jar
                if (arm.targetCoin && arm.targetCoin.label === 'coin') {
                    const jarTop = { x: j.x, y: j.y - j.h / 2 - 20 };
                    const dir = {
                        x: jarTop.x - arm.targetCoin.position.x,
                        y: jarTop.y - arm.targetCoin.position.y
                    };
                    const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
                    if (mag > 0) {
                        MBody.applyForce(arm.targetCoin, arm.targetCoin.position, {
                            x: (dir.x / mag) * 0.005,
                            y: (dir.y / mag) * 0.005
                        });
                    }
                }
                arm.phase = 'dragging';
                arm.animProgress = 0;
            }
            break;
        }
        case 'dragging': {
            // Keep pushing the coin toward the jar opening
            if (!arm.targetCoin || arm.targetCoin.label !== 'coin') {
                arm.phase = 'retracting';
                arm.animProgress = 0;
                return;
            }
            const jarTop = { x: j.x, y: j.y - j.h / 2 - 15 };
            const coinPos = arm.targetCoin.position;
            const dist = Math.sqrt(
                Math.pow(coinPos.x - jarTop.x, 2) +
                Math.pow(coinPos.y - jarTop.y, 2)
            );
            
            if (dist < 40) {
                // Coin is near jar opening - drop it!
                arm.phase = 'dropping';
                arm.animProgress = 0;
                arm.gripOpen = true;
            } else if (arm.animProgress < 3) {
                // Keep nudging toward jar
                const dir = {
                    x: jarTop.x - coinPos.x,
                    y: jarTop.y - coinPos.y
                };
                const m = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
                if (m > 0) {
                    MBody.applyForce(arm.targetCoin, coinPos, {
                        x: (dir.x / m) * 0.004,
                        y: (dir.y / m) * 0.004 - 0.002 // slight upward nudge
                    });
                }
            } else {
                // Took too long, just drop it
                arm.phase = 'dropping';
                arm.animProgress = 0;
                arm.gripOpen = true;
            }
            break;
        }
        case 'dropping': {
            // Release coin and retract
            if (arm.animProgress >= 0.3) {
                arm.phase = 'retracting';
                arm.animProgress = 0;
                arm.gripOpen = true;
                arm.targetCoin = null;
            }
            break;
        }
        case 'retracting': {
            // Arm pulls back to rest position
            if (arm.animProgress >= 1) {
                arm.phase = 'idle';
                arm.active = false;
                arm.gripOpen = true;
                arm.animProgress = 0;
                
                // Check if there are coins still outside the jar that need help
                setTimeout(() => {
                    findNextCoinForArm();
                }, 500);
            }
            break;
        }
    }
}

function findNextCoinForArm() {
    if (!state.jarIntact || state.arm.phase !== 'idle') return;
    const j = state.jarBody;
    if (!j) return;
    
    // Find a coin that's above the jar (not yet inside)
    const jarTop = j.y - j.h / 2;
    for (const coin of state.coinBodies) {
        if (coin.label === 'coin' && coin.position.y < jarTop - 10) {
            activateArmForCoin(coin);
            return;
        }
    }
}

function drawMechanicalArm(ctx, cw, ch) {
    const arm = state.arm;
    const j = state.jarBody;
    if (!j) return;
    
    ctx.save();
    
    // Arm base mount (top-right corner)
    const baseX = cw - 30;
    const baseY = 10;
    
    // Calculate arm positions based on phase
    let elbowX, elbowY, clawX, clawY;
    
    if (arm.phase === 'idle') {
        // Resting position - folded up
        elbowX = baseX - 30;
        elbowY = baseY + 25;
        clawX = baseX - 15;
        clawY = baseY + 45;
    } else if (arm.targetCoin && arm.targetCoin.label === 'coin') {
        // Animated position toward target
        const targetPos = arm.targetCoin.position;
        const t = Math.min(arm.animProgress, 1);
        
        // Interpolate elbow
        const restElbowX = baseX - 30;
        const restElbowY = baseY + 25;
        const reachElbowX = baseX - (baseX - targetPos.x) * 0.5;
        const reachElbowY = baseY + (targetPos.y - baseY) * 0.4;
        elbowX = restElbowX + (reachElbowX - restElbowX) * t;
        elbowY = restElbowY + (reachElbowY - restElbowY) * t;
        
        // Claw follows target more directly
        const restClawX = baseX - 15;
        const restClawY = baseY + 45;
        clawX = restClawX + (targetPos.x - restClawX) * t;
        clawY = restClawY + (targetPos.y - restClawY) * t;
    } else {
        elbowX = baseX - 30;
        elbowY = baseY + 25;
        clawX = baseX - 15;
        clawY = baseY + 45;
    }
    
    // ---- Draw pixel-style mechanical arm ----
    
    // Mounting plate (pixel style)
    ctx.fillStyle = '#555';
    ctx.fillRect(baseX - 12, baseY - 5, 24, 15);
    ctx.fillStyle = '#777';
    ctx.fillRect(baseX - 10, baseY - 3, 20, 11);
    // Bolts on mount
    ctx.fillStyle = '#999';
    ctx.fillRect(baseX - 7, baseY, 4, 4);
    ctx.fillRect(baseX + 3, baseY, 4, 4);
    
    // Upper arm segment (base to elbow) - pixel style
    drawPixelArmSegment(ctx, baseX, baseY + 5, elbowX, elbowY, 8, '#ff4444', '#cc2222');
    
    // Elbow joint
    ctx.fillStyle = '#ffcc00'; // yellow joint
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9900';
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Forearm segment (elbow to claw) - pixel style
    drawPixelArmSegment(ctx, elbowX, elbowY, clawX, clawY, 6, '#44aaff', '#2288dd');
    
    // Wrist joint
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(clawX, clawY, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Claw / gripper (pixel style)
    const gripAngle = Math.atan2(clawY - elbowY, clawX - elbowX);
    const gripLen = arm.gripOpen ? 18 : 12;
    const gripSpread = arm.gripOpen ? 0.5 : 0.15;
    
    // Left finger
    const lfX = clawX + Math.cos(gripAngle + gripSpread) * gripLen;
    const lfY = clawY + Math.sin(gripAngle + gripSpread) * gripLen;
    drawPixelArmSegment(ctx, clawX, clawY, lfX, lfY, 3, '#44ff44', '#22cc22');
    
    // Right finger
    const rfX = clawX + Math.cos(gripAngle - gripSpread) * gripLen;
    const rfY = clawY + Math.sin(gripAngle - gripSpread) * gripLen;
    drawPixelArmSegment(ctx, clawX, clawY, rfX, rfY, 3, '#44ff44', '#22cc22');
    
    // Finger tips (pixel dots)
    ctx.fillStyle = '#66ff66';
    ctx.fillRect(Math.round(lfX) - 2, Math.round(lfY) - 2, 4, 4);
    ctx.fillRect(Math.round(rfX) - 2, Math.round(rfY) - 2, 4, 4);
    
    // Status indicator light on the mount
    const lightColor = arm.phase === 'idle' ? '#44ff44' : (arm.phase === 'dragging' ? '#ffaa00' : '#ff4444');
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(baseX + 6, baseY + 6, 3, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.fillStyle = lightColor.replace('ff', '44');
    ctx.beginPath();
    ctx.arc(baseX + 6, baseY + 6, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARM-v1', baseX, baseY + 22);
    
    ctx.restore();
}

function drawPixelArmSegment(ctx, x1, y1, x2, y2, width, mainColor, shadeColor) {
    // Draw a pixel-art style arm segment between two points
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    
    const angle = Math.atan2(dy, dx);
    const perpX = Math.cos(angle + Math.PI/2);
    const perpY = Math.sin(angle + Math.PI/2);
    
    const halfW = width / 2;
    const pixelSnap = 2; // snap to pixel grid
    
    // Main body
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.moveTo(x1 + perpX * halfW, y1 + perpY * halfW);
    ctx.lineTo(x2 + perpX * halfW, y2 + perpY * halfW);
    ctx.lineTo(x2 - perpX * halfW, y2 - perpY * halfW);
    ctx.lineTo(x1 - perpX * halfW, y1 - perpY * halfW);
    ctx.closePath();
    ctx.fill();
    
    // Shading edge (one side)
    ctx.fillStyle = shadeColor;
    ctx.beginPath();
    ctx.moveTo(x1 + perpX * halfW, y1 + perpY * halfW);
    ctx.lineTo(x2 + perpX * halfW, y2 + perpY * halfW);
    ctx.lineTo(x2 + perpX * (halfW - 2), y2 + perpY * (halfW - 2));
    ctx.lineTo(x1 + perpX * (halfW - 2), y1 + perpY * (halfW - 2));
    ctx.closePath();
    ctx.fill();
    
    // Pixel rivets along the segment
    ctx.fillStyle = '#ddd';
    const rivetSpacing = 15;
    const numRivets = Math.floor(len / rivetSpacing);
    for (let i = 1; i < numRivets; i++) {
        const t = i / numRivets;
        const rx = Math.round((x1 + dx * t) / pixelSnap) * pixelSnap;
        const ry = Math.round((y1 + dy * t) / pixelSnap) * pixelSnap;
        ctx.fillRect(rx - 1, ry - 1, 3, 3);
    }
}

// ===== SHARD DAMAGE SYSTEM =====
function damageFromShard() {
    if (state.hasGloves) return; // Gloves protect!
    const now = Date.now();
    if (now - state.lastShardDamage < 800) return; // Rate limit - no damage spam
    state.lastShardDamage = now;
    
    const dmg = 5 + Math.floor(Math.random() * 10); // 5-15 damage
    state.health = Math.max(0, state.health - dmg);
    
    // Also lose some money from the pain (drops a few dollars)
    const lost = Math.min(state.balance, Math.floor(Math.random() * 10) + 2);
    if (lost > 0) {
        state.balance -= lost;
        addTransaction(`Dropped $${lost.toFixed(2)} (shard cut!)`, -lost);
    }
    
    // Screen flash red
    document.body.style.boxShadow = 'inset 0 0 80px rgba(255,0,0,0.4)';
    setTimeout(() => { document.body.style.boxShadow = ''; }, 300);
    
    // Spawn wound particles at a random position on canvas
    if (state.jarBody) {
        const j = state.jarBody;
        for (let i = 0; i < 8; i++) {
            state.woundParticles.push({
                x: j.x + (Math.random() - 0.5) * j.w,
                y: j.y + (Math.random() - 0.5) * j.h,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 3,
                life: 1,
            });
        }
    }
    
    // Play OW sound
    playOwSound();
    
    updateUI();
    
    if (state.health <= 0) {
        // You died from shard cuts
        state.health = 20; // Resurrect with low hp
        state.balance = Math.max(0, state.balance - 50); // Hospital bill
        addTransaction('Hospital Bill (shard injuries)', -50);
        alert('OW! You got cut so bad you had to go to the hospital. -$50. Maybe buy some gloves?');
    }
}

function playOwSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Sharp "ouch" sound - quick frequency sweep
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
        
        // Follow-up "ow" tone
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(500, audioCtx.currentTime + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.25);
        gain2.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(audioCtx.currentTime + 0.05);
        osc2.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
}

function buyGloves() {
    if (state.hasGloves) {
        alert('You already have gloves!');
        return;
    }
    if (state.balance < 600) {
        alert(`You need $600 for Protective Gloves! You only have $${state.balance.toFixed(2)}.`);
        return;
    }
    state.balance -= 600;
    state.hasGloves = true;
    addTransaction('Purchased Protective Gloves', -600);
    updateUI();
}

// ===== RENT SPAWNER =====
function startRentSpawner() {
    // First rent arrives after 2 minutes
    state.rentTimer = setTimeout(() => {
        spawnRent();
        // Then every 2 minutes after that
        state.rentInterval = setInterval(() => {
            spawnRent();
        }, 120000); // 2 minutes = 120000ms
    }, 120000); // First one after 2 mins
}

function spawnRent() {
    const rentAmount = 800 + Math.floor(Math.random() * 400); // $800-$1200
    const rent = {
        id: state.nextUtilityId++,
        name: `Rent (${state.utilities.filter(u => u.name.startsWith('Rent')).length + 1})`,
        amount: rentAmount,
        dueIn: 24, // 24 "game seconds" ~2 real minutes
        overdue: false,
        paid: false,
    };
    state.utilities.push(rent);
    renderUtilities();
    updateUI();
    addTransaction(`Rent bill arrived: $${rentAmount.toFixed(2)}`, 0);
    
    // Play a door knock sound
    playKnockSound();
}

function playKnockSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 3; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 120;
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.15 + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + i * 0.15);
            osc.stop(audioCtx.currentTime + i * 0.15 + 0.1);
        }
    } catch (e) {}
}

// ===== SMASH JAR =====
function smashJar() {
    if (!state.jarIntact) return;
    
    state.jarIntact = false;
    state.jarsSmashed++;
    state.hammerMode = false;
    $('#hammer-btn').classList.remove('active');
    $('#jar-container').classList.remove('hammer-cursor');
    
    // Remove jar walls (the glass breaks)
    Composite.remove(state.engine.world, state.jarWallBodies);
    state.jarWallBodies = [];

    // Create shard physics objects
    createShards();

    // Create smash particles
    const j = state.jarBody;
    for (let i = 0; i < 50; i++) {
        state.smashParticles.push({
            x: j.x + (Math.random() - 0.5) * j.w,
            y: j.y + (Math.random() - 0.5) * j.h,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15 - 5,
            life: 1,
            color: ['#87CEEB', '#B0E0E6', '#ADD8E6', '#FFFFFF', '#F0F8FF'][Math.floor(Math.random() * 5)]
        });
    }

    // Give coins some explosive force
    state.coinBodies.forEach(coin => {
        const force = {
            x: (Math.random() - 0.5) * 0.08,
            y: -(Math.random() * 0.1 + 0.02)
        };
        Body.applyForce(coin, coin.position, force);
    });

    // Screen shake
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 500);

    // Play smash sound
    playSmashSound();

    addTransaction('SMASHED Penny Jar!', 0);
    updateUI();
}

function createShards() {
    const j = state.jarBody;
    const cw = $('#jar-canvas').width;
    const ch = $('#jar-canvas').height;
    
    console.log('🔨 Creating shards! Jar center:', j.x, j.y, 'Canvas:', cw, ch);
    
    // Create 8-10 spikey shard pieces
    const numShards = 9;
    state.shardPositions = [];
    state.shardBodies = [];

    for (let i = 0; i < numShards; i++) {
        const angle = (i / numShards) * Math.PI * 2;
        const startX = j.x + Math.cos(angle) * 60;
        const startY = j.y + Math.sin(angle) * 80;
        
        // Target position for reassembly (on the jar outline)
        const targetX = j.x + Math.cos(angle) * (j.w / 2);
        const targetY = j.y + Math.sin(angle + Math.PI/2) * (j.h / 2);
        
        // Create SPIKEY shard vertices - irregular jagged shapes
        const numPoints = 6 + Math.floor(Math.random() * 4); // 6-9 points
        const avgRadius = 12 + Math.random() * 14;
        const vertices = [];
        for (let p = 0; p < numPoints; p++) {
            const a = (p / numPoints) * Math.PI * 2;
            // Alternate between spiky tips and concave notches
            let r;
            if (p % 2 === 0) {
                // Spiky tip - extends outward
                r = avgRadius * (1.2 + Math.random() * 0.8); // 120-200% of avg
            } else {
                // Concave notch - cuts inward
                r = avgRadius * (0.3 + Math.random() * 0.3); // 30-60% of avg
            }
            vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
        
        const shard = Bodies.fromVertices(startX, startY, [vertices], {
            restitution: 0.4,
            friction: 0.6,
            density: 0.004,
            label: 'shard',
            render: {
                fillStyle: `rgba(${140 + Math.floor(Math.random()*40)}, ${200 + Math.floor(Math.random()*30)}, ${235}, 0.9)`,
                strokeStyle: '#ff6666',
                lineWidth: 2,
                visible: true,
            },
            shardIndex: i,
        });
        
        // Fallback if fromVertices fails (convex decomposition issue)
        if (!shard) {
            console.warn('⚠️ Shard creation failed, using fallback');
            // Use a simple polygon instead
            const triangle = Bodies.polygon(startX, startY, 5, avgRadius, {
                restitution: 0.4,
                friction: 0.6,
                density: 0.004,
                label: 'shard',
                render: {
                    fillStyle: 'rgba(160, 215, 235, 0.9)',
                    strokeStyle: '#ff6666',
                    lineWidth: 2,
                    visible: true,
                },
                shardIndex: i,
            });
            if (triangle) {
                state.shardBodies.push(triangle);
                state.shards.push({ index: i, body: triangle });
                state.shardPositions.push({ targetX, targetY, placed: false, index: i });
                Body.setVelocity(triangle, {
                    x: (Math.random() - 0.5) * 12,
                    y: -(Math.random() * 8 + 2)
                });
            }
            continue;
        }
        
        console.log(`✅ Shard ${i} created at:`, startX, startY, 'Vertices:', vertices.length);
        
        // Give shards explosive velocity
        Body.setVelocity(shard, {
            x: (Math.random() - 0.5) * 12,
            y: -(Math.random() * 8 + 2)
        });

        state.shardPositions.push({
            targetX,
            targetY,
            placed: false,
            index: i,
        });
        
        state.shardBodies.push(shard);
        state.shards.push({ index: i, body: shard });
    }
    
    console.log('🔨 Adding', state.shardBodies.length, 'shards to world');
    Composite.add(state.engine.world, state.shardBodies);
}

function playSmashSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Crash sound
        const bufferSize = audioCtx.sampleRate * 0.3;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        
        source.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();
        
        // Tinkling glass sound
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const g2 = audioCtx.createGain();
            osc.frequency.setValueAtTime(2000 + Math.random() * 3000, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
            g2.gain.setValueAtTime(0.1, audioCtx.currentTime);
            g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            osc.connect(g2);
            g2.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
        }, 100);
    } catch (e) {
        // Audio not available, that's fine
    }
}

// ===== BUY NEW JAR =====
function buyNewJar() {
    if (state.jarIntact) return;
    if (state.balance < 15) {
        alert('You need $15.00 to buy a new jar! You only have $' + state.balance.toFixed(2));
        return;
    }
    
    state.balance -= 15;
    addTransaction('Purchased New Jar', -15);
    
    // Remove shard bodies
    state.shardBodies.forEach(sb => {
        Composite.remove(state.engine.world, sb);
    });
    state.shards = [];
    state.shardBodies = [];
    state.shardPositions = [];
    
    // Recreate jar
    const cw = $('#jar-canvas').width;
    const ch = $('#jar-canvas').height;
    createJarBodies(cw, ch);
    
    state.jarIntact = true;
    state.jarBoughtCount++;
    
    // Keep coins but they're now contained again
    addTransaction('New jar in place!', 0);
    updateUI();
}

// ===== REASSEMBLE JAR =====
function reassembleJar() {
    if (state.jarIntact) return;
    
    const allPlaced = state.shardPositions.every(sp => sp.placed);
    
    if (!allPlaced) {
        // Try to place any shard that's near its target
        let placed = 0;
        state.shardBodies.forEach((sb, i) => {
            if (state.shardPositions[i] && !state.shardPositions[i].placed) {
                const sp = state.shardPositions[i];
                const dist = Vector.magnitude(Vector.sub(sb.position, { x: sp.targetX, y: sp.targetY }));
                if (dist < 40) {
                    // Snap to position
                    Body.setPosition(sb, { x: sp.targetX, y: sp.targetY });
                    Body.setVelocity(sb, { x: 0, y: 0 });
                    Body.setStatic(sb);
                    sp.placed = true;
                    placed++;
                }
            }
        });
        
        if (placed === 0) {
            alert('Drag the shards close to the dotted jar outline to reassemble! Each shard needs to be near its target position.');
        }
        updateUI();
        return;
    }
    
    // All shards placed - reassemble!
    state.shardBodies.forEach(sb => {
        Composite.remove(state.engine.world, sb);
    });
    state.shards = [];
    state.shardBodies = [];
    state.shardPositions = [];
    
    const cw = $('#jar-canvas').width;
    const ch = $('#jar-canvas').height;
    createJarBodies(cw, ch);
    
    state.jarIntact = true;
    addTransaction('Reassembled Penny Jar! (Free!)', 0);
    
    // Play repair sound
    playRepairSound();
    updateUI();
}

function playRepairSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
}

function playSnapSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 600;
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
}

// ===== SPEND COINS =====
function spendFromJar() {
    if (state.jarIntact) {
        alert('You need to SMASH the jar first!');
        return;
    }
    $('#spend-overlay').classList.remove('hidden');
    updateSpendAmount();
}

function updateSpendAmount() {
    let total = 0;
    state.spendingCoins.forEach(c => total += c.coinValue || 0);
    $('#spend-running').textContent = total.toFixed(2);
}

function confirmSpending() {
    let total = 0;
    state.spendingCoins.forEach(c => {
        total += c.coinValue || 0;
        Composite.remove(state.engine.world, c);
    });
    
    state.balance += total;
    state.jarBalance = Math.max(0, state.jarBalance - total);
    
    state.coinBodies = state.coinBodies.filter(c => !state.spendingCoins.includes(c));
    state.spendingCoins = [];
    
    addTransaction('Spent from Penny Jar', total);
    $('#spend-overlay').classList.add('hidden');
    updateUI();
}

function cancelSpending() {
    state.spendingCoins = [];
    $('#spend-overlay').classList.add('hidden');
}

// ===== ANNOYING REMINDERS =====
let closeXDodgeInterval = null;
let autoReopenInterval = null;
let popupSpamInterval = null;

function startReminderSystem() {
    // Count down utility due times
    setInterval(() => {
        state.utilities.forEach(u => {
            if (!u.paid) {
                u.dueIn -= 1;
                if (u.dueIn <= 0 && !u.overdue) {
                    u.overdue = true;
                    triggerReminder(u);
                }
                if (u.dueIn <= -5 && u.overdue && !u.paid) {
                    // Extra annoying repeat reminder
                    if (Math.random() < 0.4) { // 40% chance each tick
                        triggerRageReminder(u);
                    }
                }
            }
        });
        renderUtilities();
        renderReminderList();
        updateUI();
    }, 5000); // Every 5 seconds = 1 "game minute"

    // Make the close X button dodge the mouse
    const closeX = $('#reminder-close-x');
    closeX.addEventListener('mouseenter', () => {
        // The close button RUNS AWAY
        const modal = $('#reminder-modal');
        const maxX = modal.offsetWidth - 30;
        const maxY = modal.offsetHeight - 30;
        closeX.style.position = 'absolute';
        closeX.style.left = Math.random() * maxX + 'px';
        closeX.style.top = Math.random() * maxY + 'px';
        closeX.style.fontSize = '8px'; // Gets smaller each time
        closeX.style.transition = 'all 0.15s ease';
    });

    // Auto-reopen reminders if bills are overdue
    autoReopenInterval = setInterval(() => {
        const hasOverdue = state.utilities.some(u => u.overdue && !u.paid);
        const anyVisible = !$('#reminder-overlay').classList.contains('hidden') ||
                          !$('#reminder-overlay-2').classList.contains('hidden') ||
                          !$('#rage-overlay').classList.contains('hidden');
        if (hasOverdue && !anyVisible) {
            // Randomly show a reminder again
            const r = Math.random();
            if (r < 0.3) {
                const overdueUtil = state.utilities.find(u => u.overdue && !u.paid);
                if (overdueUtil) triggerReminder(overdueUtil);
            } else if (r < 0.5) {
                $('#reminder-overlay-2').classList.remove('hidden');
                playAlarmSound();
            }
        }
    }, 12000); // Check every 12 seconds

    // Popup spam - small floating reminders
    popupSpamInterval = setInterval(() => {
        const overdue = state.utilities.filter(u => u.overdue && !u.paid);
        if (overdue.length > 0 && Math.random() < 0.3) {
            spawnFloatingReminder(overdue[Math.floor(Math.random() * overdue.length)]);
        }
    }, 15000);
}

function renderReminderList() {
    const list = $('#reminder-list');
    const active = state.utilities.filter(u => !u.paid);
    if (active.length === 0) {
        list.innerHTML = '<div class="reminder-empty">All bills paid! 🎉</div>';
        return;
    }
    list.innerHTML = active.map(u => `
        <div class="reminder-item">
            <div class="reminder-name ${u.overdue ? 'reminder-urgent' : ''}">${u.name}</div>
            <div class="reminder-time">${u.overdue ? '⚠ OVERDUE!' : `Due in ${u.dueIn}s`}</div>
        </div>
    `).join('');
}

function triggerReminder(utility) {
    state.reminderCount++;
    const overlay = $('#reminder-overlay');
    overlay.classList.remove('hidden');
    
    $('#reminder-title').textContent = `${utility.name.toUpperCase()} PAYMENT DUE`;
    $('#reminder-message').textContent = `Your ${utility.name} bill of $${utility.amount.toFixed(2)} is now OVERDUE. Pay immediately to avoid service disruption.`;
    
    const threats = [
        'Your utilities WILL be terminated in 30 seconds.',
        'We have sent a strongly-worded letter to your landlord.',
        'Your neighbors have been notified of your delinquency.',
        'A collection agent has been dispatched to your area.',
        'This will appear on your permanent record. Yes, we have those.',
        'We are legally required to inform you that we are VERY disappointed.',
        'Your credit score has been set on fire. Figuratively. For now.',
    ];
    $('#reminder-threat').textContent = threats[Math.floor(Math.random() * threats.length)];
    
    // Play alarm sound
    playAlarmSound();
}

function dismissReminder() {
    $('#reminder-overlay').classList.add('hidden');
    // Reset close button position
    const closeX = $('#reminder-close-x');
    closeX.style.left = '';
    closeX.style.top = '';
    closeX.style.fontSize = '18px';
    closeX.style.position = 'absolute';
    
    state.dismissedReminders++;
    
    // THE REMINDERS MULTIPLY
    if (state.dismissedReminders >= 1) {
        setTimeout(() => {
            if (state.utilities.some(u => u.overdue && !u.paid)) {
                $('#reminder-overlay-2').classList.remove('hidden');
                playAlarmSound();
            }
        }, 1500);
    }
    
    if (state.dismissedReminders >= 3) {
        setTimeout(() => {
            if (state.utilities.some(u => u.overdue && !u.paid)) {
                triggerRageReminder();
            }
        }, 2000);
    }
    
    // Spawn MORE floating popups as punishment
    const overdue = state.utilities.filter(u => u.overdue && !u.paid);
    for (let i = 0; i < Math.min(state.dismissedReminders, 5); i++) {
        setTimeout(() => spawnFloatingReminder(overdue[Math.floor(Math.random() * overdue.length)]), i * 300);
    }
}

function payFromReminder() {
    $('#reminder-overlay').classList.add('hidden');
    // Show utility list
    const overdue = state.utilities.find(u => u.overdue && !u.paid);
    if (overdue) {
        payUtility(overdue.id);
    }
}

function payFromReminder2() {
    $('#reminder-overlay-2').classList.add('hidden');
    const overdue = state.utilities.find(u => u.overdue && !u.paid);
    if (overdue) {
        payUtility(overdue.id);
    }
}

function triggerRageReminder(utility) {
    const overlay = $('#rage-overlay');
    overlay.classList.remove('hidden');
    
    const messages = [
        'PAY YOUR BILLS',
        'WE WILL NOT STOP',
        'THIS IS YOUR FINAL WARNING',
        'YOUR UTILITIES ARE BEING TERMINATED',
        'WE HAVE YOUR SOCIAL SECURITY NUMBER',
        'COMPLIANCE IS NOT OPTIONAL',
    ];
    
    $('#rage-text').textContent = messages[Math.floor(Math.random() * (messages.length / 2))];
    $('#rage-subtext').textContent = messages[Math.floor(Math.random() * messages.length + messages.length / 2)];
    
    // Extremely annoying sound
    playRageAlarm();
    
    // Vibrate if available
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

function payFromRage() {
    $('#rage-overlay').classList.add('hidden');
    const overdue = state.utilities.filter(u => u.overdue && !u.paid);
    overdue.forEach(u => {
        if (state.balance >= u.amount) {
            payUtility(u.id);
        }
    });
}

// ===== FLOATING REMINDER POPUPS =====
function spawnFloatingReminder(utility) {
    if (!utility) return;
    
    const popup = document.createElement('div');
    popup.className = 'floating-reminder';
    popup.innerHTML = `
        <div class="floating-reminder-header">
            <span>⚠ ${utility.name}</span>
            <button class="floating-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        <div class="floating-reminder-body">
            $${utility.amount.toFixed(2)} OVERDUE!<br>
            <small>Pay now before we get really annoying.</small>
        </div>
    `;
    
    // Random position
    popup.style.left = (50 + Math.random() * (window.innerWidth - 300)) + 'px';
    popup.style.top = (80 + Math.random() * (window.innerHeight - 250)) + 'px';
    
    document.body.appendChild(popup);
    
    // Make it draggable
    let isDragging = false;
    let offsetX, offsetY;
    popup.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - popup.offsetLeft;
        offsetY = e.clientY - popup.offsetTop;
        popup.style.zIndex = '3000';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        popup.style.left = (e.clientX - offsetX) + 'px';
        popup.style.top = (e.clientY - offsetY) + 'px';
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // Auto-remove after 15 seconds
    setTimeout(() => {
        if (popup.parentElement) {
            popup.style.transition = 'opacity 0.5s';
            popup.style.opacity = '0';
            setTimeout(() => popup.remove(), 500);
        }
    }, 15000);
    
    // Play a little blip
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
}

// ===== ALARM SOUNDS =====
function playAlarmSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Beep beep
        for (let i = 0; i < 3; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.2 + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + i * 0.2);
            osc.stop(audioCtx.currentTime + i * 0.2 + 0.15);
        }
    } catch (e) {}
}

function playRageAlarm() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Siren
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        
        // Siren sweep
        for (let i = 0; i < 8; i++) {
            osc.frequency.setValueAtTime(400, audioCtx.currentTime + i * 0.25);
            osc.frequency.linearRampToValueAtTime(900, audioCtx.currentTime + i * 0.25 + 0.125);
            osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + i * 0.25 + 0.25);
        }
        
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 2);
    } catch (e) {}
}

// ===== COIN SPENDING VIA DOUBLE-CLICK =====
function handleCoinSpend(coinBody) {
    if (state.jarIntact) return;
    
    // Mark coin for spending
    if (!state.spendingCoins.includes(coinBody)) {
        state.spendingCoins.push(coinBody);
        // Highlight the coin
        coinBody.render.fillStyle = '#FFD700';
        
        // Add to balance immediately
        state.balance += coinBody.coinValue || 0;
        state.jarBalance = Math.max(0, state.jarBalance - (coinBody.coinValue || 0));
        addTransaction(`Spent coin: $${(coinBody.coinValue || 0).toFixed(2)}`, coinBody.coinValue || 0);
        
        // Remove from physics
        Composite.remove(state.engine.world, coinBody);
        state.coinBodies = state.coinBodies.filter(c => c !== coinBody);
        state.spendingCoins = state.spendingCoins.filter(c => c !== coinBody);
        
        updateUI();
    }
}

// ===== EVENT BINDINGS =====
function bindEvents() {
    $('#deposit-btn').addEventListener('click', depositToAccount);
    $('#deposit-jar-btn').addEventListener('click', depositToJar);
    $('#deposit-amount').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') depositToAccount();
    });
    
    // Hammer toggle
    $('#hammer-btn').addEventListener('click', () => {
        if (!state.jarIntact) {
            alert('The jar is already smashed!');
            return;
        }
        if (state.jarBalance <= 0) {
            alert('The jar is empty! Add some money first.');
            return;
        }
        state.hammerMode = !state.hammerMode;
        $('#hammer-btn').classList.toggle('active', state.hammerMode);
        $('#jar-container').classList.toggle('hammer-cursor', state.hammerMode);
        updateUI();
    });
    
    // Buy jar
    $('#buy-jar-btn').addEventListener('click', buyNewJar);
    
    // Buy gloves
    const glovesBtn = $('#buy-gloves-btn');
    if (glovesBtn) glovesBtn.addEventListener('click', buyGloves);
    
    // Reassemble
    $('#reassemble-btn').addEventListener('click', reassembleJar);
    
    // Reminder buttons
    $('#reminder-pay-btn').addEventListener('click', payFromReminder);
    $('#reminder-dismiss-btn').addEventListener('click', dismissReminder);
    $('#reminder-close-x').addEventListener('click', dismissReminder);
    $('#reminder-2-pay').addEventListener('click', payFromReminder2);
    $('#rage-pay-btn').addEventListener('click', payFromRage);
    
    // Spend modal
    $('#spend-confirm').addEventListener('click', confirmSpending);
    $('#spend-cancel').addEventListener('click', cancelSpending);
    
    // Double-click on canvas to spend coins
    $('#jar-canvas').addEventListener('dblclick', (e) => {
        if (state.jarIntact) return;
        
        // Use Matter mouse for coordinate conversion
        const mPos = state.render.mouse.position;
        if (!mPos) return;
        
        // Find coin near click
        const allCoins = state.coinBodies.filter(c => c.label === 'coin');
        for (const coin of allCoins) {
            const dist = Vector.magnitude(Vector.sub(
                mPos, coin.position
            ));
            if (dist < coin.circleRadius + 10) {
                handleCoinSpend(coin);
                break;
            }
        }
    });

    // Clicking canvas in hammer mode near jar
    $('#jar-canvas').addEventListener('click', (e) => {
        if (state.hammerMode && state.jarIntact) {
            const mPos = state.render.mouse.position;
            if (!mPos) return;
            const jarCenter = getJarCenter();
            if (jarCenter) {
                const dist = Vector.magnitude(Vector.sub(mPos, jarCenter));
                if (dist < 120) {
                    smashJar();
                }
            }
        }
    });

    // Shard proximity check on drag end
    Events.on(state.engine, 'afterUpdate', () => {
        if (!state.jarIntact && state.shardPositions.length > 0) {
            state.shardBodies.forEach((sb, i) => {
                if (state.shardPositions[i] && !state.shardPositions[i].placed) {
                    const sp = state.shardPositions[i];
                    const dist = Vector.magnitude(Vector.sub(sb.position, { x: sp.targetX, y: sp.targetY }));
                    // Visual feedback - green glow when close, red spiky normally
                    if (dist < 55) {
                        sb.render.fillStyle = 'rgba(100, 255, 100, 0.75)';
                        sb.render.strokeStyle = '#44ff44';
                    } else {
                        sb.render.fillStyle = 'rgba(160, 215, 235, 0.75)';
                        sb.render.strokeStyle = '#ff6666'; // Dangerous red outline
                    }
                }
            });
        }
    });

    // Initial reminder list render
    renderReminderList();
}