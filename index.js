require('dotenv').config();

const axios = require('axios');
const mineflayer = require('mineflayer');
const pvp = require('mineflayer-pvp').plugin;
const pathfinderPlugin = require('mineflayer-pathfinder');
const { pathfinder, Movements, goals } = pathfinderPlugin;
const {
  GoalNear, GoalBlock, GoalXZ, GoalY,
  GoalInvert, GoalFollow, GoalBreakBlock, GoalPlaceBlock, GoalLookAtBlock
} = goals;
const { loader: autoEat } = require('mineflayer-auto-eat');
const { Vec3 } = require('vec3');
const fs = require('fs');
const path = require('path');
const { status } = require('minecraft-server-util');
const chalk = require('chalk');
const { setupCombat } = require('./combat');
const { equipBestGear } = require('./equipBestGear');

//Virendra.minehut.gg:25565
//Aternos IP: The_Boyss.aternos.me:34796 
const SERVER_HOST = 'The_Boyss.aternos.me';
const SERVER_PORT = 34796; // 19132 for minehut real player(s)
const BOT_USERNAME = 'Aisha';
const pickUpCooldown = 5000;
const MAX_RETRIES = 3; 
const FLEE_HEALTH = 6; 

const log = {
  info: chalk.blue.bold,          // General info
  success: chalk.green.bold,      // Success messages
  warn: chalk.yellow.bold,        // Warnings
  error: chalk.red.bold,          // Errors
  ping: chalk.cyan,               // Server pinging
  bot: chalk.magenta,             // Bot-specific logs
  event: chalk.hex('#FFA500'),    // Custom color for events
  player: chalk.greenBright,      // Player-related info
};


let bot = null;
let inactivityTimer = null;
let lastPlayerActivity = Date.now(); 
let lastActivity = Date.now(); 
let mcData;
let isCancelled = false;  
let lastPickUpTime = 0;
let playerRetryAttempts = 0;

let serverPingInterval = null;
let playerCheckInterval = null;
let playerQuitCheckInterval = null;
let botRunning = false; 
let cooldownTimer = null;

const http = require('http');
const { version } = require('os');

const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Bot is running!\n');
}).listen(port, () => {
  console.log(`🌐 HTTP server running on port ${port}`);
});

async function pingServerAndDecide() {
  try {
    const result = await status(SERVER_HOST, SERVER_PORT);
    console.log(chalk.green("✅ Server online."));
    
    const onlinePlayers = result.players.online;

    console.log("Checking real player count...");
    if (onlinePlayers > 0) {
      console.log(`👤 ${onlinePlayers} real player(s) online.`);
      playerRetryAttempts = 0; 

      if (!botRunning) {
        startBot();
      }
    } else {
      playerRetryAttempts++;
      console.log(chalk.cyan(`🕵️ No real players online. Attempt ${playerRetryAttempts}/${MAX_RETRIES}`));
      
      if (playerRetryAttempts >= MAX_RETRIES) {
        console.log("🚫 Max retries reached. Stopping bot if running.");
        if (botRunning) {
          stopBot();
        }
        resetRetryCooldown(); 
      }
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || (error.errors && error.errors.some(e => e.code === 'ECONNREFUSED'))) {
      console.log("⚠️ Server offline (connection refused). Ignoring error.");
    } else {
      console.error("❌ Unexpected error pinging server:", error);
    }
  }
}

pingServerAndDecide(); 

function startPlayerCheckLoop() {
  if (playerCheckInterval) clearInterval(playerCheckInterval);

  playerCheckInterval = setInterval(() => {
    const playersOnline = Object.values(bot.players || {});
    const realPlayers = playersOnline.filter(p => p.username !== bot.username);
    const realPlayerNames = realPlayers.map(p => p.username);

    console.log(chalk.cyan(`[Ping] Found ${realPlayerNames.length} real players online: ${JSON.stringify(realPlayerNames)}`));

    if (realPlayerNames.length > 0) {
      playerRetryAttempts = 0;
      console.log("✅ Real players detected. Continuing bot tasks...");
    } else {
      playerRetryAttempts++;
      console.log(`No players online. Attempt ${playerRetryAttempts}/${MAX_RETRIES}`);

      if (playerRetryAttempts >= MAX_RETRIES) {
        clearInterval(playerCheckInterval);
        playerCheckInterval = null;
        console.log("🚫 Max retries reached. Disconnecting bot...");
        if (bot) bot.quit();
      }
    }
  }, 10000); 
}

serverPingInterval = setInterval(pingServerAndDecide, 30_000);

setInterval(() => {
  const now = Date.now();
  const timeSinceLastActivity = (now - lastActivity) / 1000; 

  if (timeSinceLastActivity > 300) { 
    console.log("No activity detected for 5 minutes. Doing something...");
  }
}, 60 * 1000); 

function startBot() {
  if (playerRetryAttempts >= MAX_RETRIES) {
    console.log("🚫 Not starting bot because max player retry attempts reached.");
    return;
  }

  if (botRunning) {
    console.log("⚠️ Bot already running. Skipping start.");
    return;
  }

  if (playerCheckInterval) {
    clearInterval(playerCheckInterval);
    playerCheckInterval = null;
  }

  console.log("🚀 Starting bot...");
  botRunning = true;

  bot = mineflayer.createBot({
    host: SERVER_HOST,  //ip for aternos: knightbot.duckdns.org
    port: SERVER_PORT,        // port for aternos: 34796
    username: BOT_USERNAME,
    version: false
  });

  bot.loadPlugin(pvp);
  bot.loadPlugin(pathfinder);

  bot.on('login', () => {
    console.log("🤖 Bot joined.");
  });

  bot.on('end', () => {
    console.log("⛔ Bot disconnected. Clearing player check interval.");
    botRunning = false;

    if (playerCheckInterval) {
      clearInterval(playerCheckInterval);
      playerCheckInterval = null;
    }

    if (reconnectAttempts < MAX_RETRIES) {
      reconnectAttempts++;
      console.log(`🔁 Attempting to reconnect in 5 seconds... (${reconnectAttempts}/${MAX_RETRIES})`);
      setTimeout(startBot, 5000);
    } else {
      console.log("🚫 Max reconnect attempts reached. Bot will not restart.");
    }
  });
  
  bot.on('kicked', (reason) => console.log('❌ Kicked:', reason));
  bot.on('error', (err) => console.log("❗ Bot error:", err.message));
//setTimeout
  bot.once('spawn', async () => {
  try {
    reconnectAttempts = 0;
    console.log("Bot spawned. Starting player presence check loop.");
    startPlayerCheckLoop();

    mcData = require('minecraft-data')(bot.version);

    const allowedUsers = ['virendraXD', 'AB_2006', 'Aris'];

    setupCombat(bot, mcData, allowedUsers);

    equipBestGear(bot);
    setInterval(() => equipBestGear(bot), 5 * 60 * 1000);
    setInterval(() => {
      if (bot.entity && bot.entity.onGround) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
        console.log('⛳ Aisha auto-jumped.');
      }
    }, 1 * 60 * 1000);

    await bot.waitForChunksToLoad?.();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const defaultMove = new Movements(bot);
    defaultMove.allow1by1towers = true;
    defaultMove.canDig = true;
    defaultMove.scafoldingBlocks = [];
    bot.pathfinder.setMovements(defaultMove);

    bot.on('physicsTick', () => {
      if (bot.health < 10) {
      }
    
      const now = Date.now();
      if (!bot.lastTickTime || now - bot.lastTickTime > 10000) {
        console.log(`📍 Position: ${bot.entity.position}`);
        bot.lastTickTime = now;
      }
    });
    
    bot.loadPlugin(autoEat);

    bot.once('inventory', () => {
      bot.autoEat.enableAuto();
      bot.autoEat.options = {
        priority: 'auto',
        startAt: 16,
        bannedFood: [],
        healthThreshold: 14
      };
    });

    let lastFoodRequest = 0;
    const FOOD_REQUEST_COOLDOWN = 30 * 1000; 

    bot.on('health', () => {
      if (bot.food < 14 && Date.now() - lastFoodRequest > FOOD_REQUEST_COOLDOWN) {
        bot.chat("🍗 I'm hungry! Please give me some food.");
        lastFoodRequest = Date.now();
      }
    
      if (bot.food < 14 && bot.inventory.items().some(i => i.name.includes('bread') || i.name.includes('steak'))) {
        bot.chat("🍗 I'm hungry! Eating now.");
        bot.autoEat.enableAuto(); 
      }
    });

    bot.autoEat.on('eatStart', item => console.log(`🍽️ Eating ${item?.name || 'something'}`));
    bot.autoEat.on('eatFinish', item => console.log(`✅ Ate ${item?.name || 'something'}`));
    bot.autoEat.on('eatFail', err => console.error('❌ Eat fail:', err));

    bot.on('path_update', r => {
      const nodesPerTick = (r.visitedNodes * 50 / r.time).toFixed(2);
      console.log(`📍 ${r.path.length} moves. Took ${r.time.toFixed(2)} ms (${nodesPerTick} nodes/tick)`);
    });

    bot.on('goal_reached', () => console.log('🎯 Goal reached.'));
    bot.on('path_reset', reason => console.log(`♻️ Path reset: ${reason}`));

      
    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString().toLowerCase();
      const password = 'strongPassword123';
    
      if (msg.includes('/register')) {
        bot.chat(`/register ${password} ${password}`);
      } else if (msg.includes('/login')) {
        bot.chat(`/login ${password}`);
      }
    });

  bot.on('chat', async (username, message) => {
  if (username === bot.username) return; 

  lastPlayerActivity = Date.now(); 
  lastActivity = Date.now();
  console.log(`💬 ${username}: ${message}`);

  if (message.startsWith('!chat ')) {
    const query = message.slice(6).trim();
    await chatWithAI(query);
  }

  if (!message.startsWith('!')) return; 
  const args = message.slice(1).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase(); 

  if (cmd === 'help') {
    bot.chat('📜 Commands 1/2: !come | !follow | !avoid | !stop | !collect wood | !put in chest | !getlocation <username>');
    setTimeout(() => {
      bot.chat('📜 Commands 2/2: !goto x y z | !break | !place <item> | !deliver | !chat <msg>');
    }, 1000);
  }

  if (cmd === 'stop') {
    isCancelled = true;
    bot.pathfinder.setGoal(null);
    bot.chat('Stopped current task.');
  }

  if (cmd === 'collect some wood') {
    if (!hasAxe()) {
      bot.chat("🪓 I need at least a stone axe to start chopping.");
      return;
    }
  
    bot.chat("🪓 Starting wood collection...");
    isCancelled = false;
    await collectWood(64); 
  }

  if (cmd === 'put in chest') {
    await depositToChest(); 
  }

  if (cmd === 'getlocation') {
    const targetName = args[0]; 

    if (!targetName) {
      bot.chat('❌ Please specify a player name. Example: !getlocation <player>');
      return;
    }

    const playerData = bot.players[targetName];

    if (!playerData) {
      bot.chat(`❌ I can't find any data for player "${targetName}". They might be offline.`);
      return;
    }

    const entity = playerData.entity;

    if (entity) {
      const pos = entity.position;
      const dimension = bot.game.dimension; 
      bot.chat(`📍 ${targetName} is at X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)} in world: ${dimension}`);
    } else {
      bot.chat(`👀 ${targetName} is online but not currently in view. I can't track their exact location.`);
    }
  }

  const target = bot.players[username]?.entity;

  if (cmd === 'come') {
    if (!target) return bot.chat("I don't see you!");
    const p = target.position;
    bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1));
  } else if (cmd.startsWith('goto')) {
    const args = cmd.split(' '); 
    if (args.length === 4) {
      const [x, y, z] = [parseInt(args[1]), parseInt(args[2]), parseInt(args[3])];
      bot.pathfinder.setGoal(new GoalBlock(x, y, z));
    } else if (args.length === 3) {
      const [x, z] = [parseInt(args[1]), parseInt(args[2])];
      bot.pathfinder.setGoal(new GoalXZ(x, z));
    } else if (args.length === 2) {
      const y = parseInt(args[1]);
      bot.pathfinder.setGoal(new GoalY(y));
    }
  } else if (cmd === 'follow') {
    if (!target) return bot.chat("I don't see you!");
    bot.pathfinder.setGoal(new GoalFollow(target, 3), true);
  } else if (cmd === 'avoid') {
    if (!target) return bot.chat("I don't see you!");
    bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, 5)), true);
  } else if (cmd === 'break') {
    if (!target) return bot.chat("I can't see you!");
    try {
      const rayBlock = rayTraceEntitySight(target);
      if (!rayBlock) return bot.chat('Block is out of reach');
      await bot.pathfinder.goto(new GoalLookAtBlock(rayBlock.position, bot.world, { range: 4 }));
      const bestTool = bot.pathfinder.bestHarvestTool(bot.blockAt(rayBlock.position));
      if (bestTool) await bot.equip(bestTool, 'hand');
      await bot.dig(bot.blockAt(rayBlock.position), true, 'raycast');
    } catch (e) {
      console.error(e);
    }
  } else if (cmd.startsWith('place')) {
    if (!target) return bot.chat("I can't see you");
    const [, itemName] = message.split(' ');
    const items = bot.inventory.items().filter(i => i.name.includes(itemName));
    if (items.length === 0) return bot.chat('I don\'t have ' + itemName);

    try {
      const rayBlock = rayTraceEntitySight(target);
      if (!rayBlock) return bot.chat('Block is out of reach');
      const face = directionToVector(rayBlock.face);
      await bot.pathfinder.goto(new GoalPlaceBlock(rayBlock.position.offset(face.x, face.y, face.z), bot.world, { range: 4 }));
      await bot.equip(items[0], 'hand');
      await bot.lookAt(rayBlock.position.offset(face.x * 0.5 + 0.5, face.y * 0.5 + 0.5, face.z * 0.5 + 0.5));
      await bot.placeBlock(rayBlock, face);
    } catch (e) {
      console.error(e);
    }
  } else if (cmd === 'deliver') {
    try {
      const chest = findNearestTrappedChest();
      if (!chest) return bot.chat('No trapped chest nearby.');

      await bot.pathfinder.goto(new GoalNear(chest.position.x, chest.position.y, chest.position.z, 1));
      await bot.lookAt(chest.position.offset(0.5, 0.5, 0.5));

      const chestWindow = await bot.openBlock(chest);
      const items = bot.inventory.slots.slice(bot.inventory.inventoryStart, bot.inventory.inventoryEnd).filter(i => i);

      if (items.length === 0) {
        bot.chat('Nothing to deliver!');
        chestWindow.close();
        return;
      }

      for (const item of items) {
        try {
          await bot.transfer({
            window: chestWindow,
            itemType: item.type,
            metadata: item.metadata,
            sourceStart: bot.inventory.inventoryStart,
            sourceEnd: bot.inventory.inventoryEnd,
            destStart: 0,
            destEnd: chestWindow.slots.length
          });
        } catch (err) {
        }
      }

      chestWindow.close();
      bot.chat('All deliverable items placed in trapped chest.');
    } catch (e) {
      console.error(e);
      bot.chat('Failed to deliver items.');
    }
  }
  });

    console.log(chalk.green.bold('✅ Bot spawned and ready.'));
  } catch (err) {
    console.error('🚨 Error during spawn setup:', err);
  }
  });

const readline = require('readline');

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.setPrompt('> ');
rl.prompt();

let currentInput = '';

rl.on('line', (input) => {
  currentInput = '';
  rl.prompt(); // show prompt again

  if (!bot) return console.log('⛔ Bot not ready.');

  const args = input.trim().split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'say') {
    bot.chat(args.join(' '));
  } else if (command === 'pos') {
    console.log(`📍 Position: ${bot.entity.position}`);
  } else if (command === 'quit') {
    console.log('👋 Quitting bot...');
    bot.quit();
    rl.close();
  } else {
    // Treat any unknown command as direct chat
    bot.chat(input.trim());
  }
});

// Fix console log redraw while typing
const origLog = console.log;
console.log = (...args) => {
  rl.output.write('\x1b[2K\r'); // Clear current line
  origLog(...args);
  rl.output.write(`> ${currentInput}`); // Redraw input line
};

// Update currentInput while typing
rl.input.on('keypress', (char, key) => {
  if (key && key.name === 'backspace') {
    currentInput = currentInput.slice(0, -1);
  } else if (typeof char === 'string') {
    currentInput += char;
  }
});

// Bot event logging spawn
bot.on('playerJoined', (player) => {
  if (player.username !== bot.username) {
    console.log(`🎉 ${player.username} joined.`);
    lastActivity = Date.now();
  }
});

bot.on('entityMoved', (entity) => {
  if (entity.type === 'player' && entity.username !== bot.username) {
    lastActivity = Date.now();
  }
});

bot.on('entityGone', (entity) => {
  try {
    if (entity?.username) {
      console.log(`[Left] ${entity.username}`);
    }
  } catch (err) {
    console.error('❌ entityGone error:', err);
  }
});
}

// Optional utilities (from your code) view
function resetRetryCooldown() {
  if (cooldownTimer) return;
  console.log("⏳ Cooldown started. Will reset retry counter in 2 minutes.");
  cooldownTimer = setTimeout(() => {
    playerRetryAttempts = 0;
    cooldownTimer = null;
    console.log("✅ Retry cooldown ended. Bot is allowed to reconnect.");
  }, 2 * 60 * 1000);
}

function stopBot() {
  if (bot) {
    console.log("🛑 Stopping bot: No players online or max retries reached.");
    bot.quit("No players online.");
    bot = null;
  }

  clearInterval(serverPingInterval);
  clearInterval(playerCheckInterval);
  clearInterval(playerQuitCheckInterval);

  botRunning = false;
}

// Call your decision logic
pingServerAndDecide();



async function chatWithAI(message) {
  try {
    const response = await axios.post(
      'https://api.shapes.inc/v1/chat/completions',
      {
        model: `shapesinc/${process.env.SHAPESINC_SHAPE_USERNAME}`,
        messages: [
          {
            role: 'system',
            content: 'You are an AI Minecraft bot. Respond with actions the bot should do.'
          },
          {
            role: 'user',
            content: message
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SHAPESINC_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    bot.chat(reply);
    await processAICommand(reply);
  } catch (err) {
    console.log('❌ AI Error:', err.response?.data || err.message);
  }
}

async function processAICommand(message) {
  const lower = message.toLowerCase();

  if (lower.includes('wood') || lower.includes('log')) {
    const needsStack = /(some|few|enough|a stack|many)/.test(lower);
    const amount = needsStack ? 64 : 4;

    isCancelled = false;
    collectWood(amount);
  }
}

function findNearestTrappedChest() {
  const chests = bot.findBlocks({
    matching: block => block.name === 'trapped_chest',
    maxDistance: 16,
    count: 1
  });
  if (!chests.length) return null;
  return bot.blockAt(chests[0]); 
}

function logInventory() { 
  const items = bot.inventory.items().map(item => `${item.count}x ${item.name}`).join(', ')
  console.log(`Current Inventory: ${items}`)
}

async function roamAround(radius = 10) {
  const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
  const dz = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
  const target = bot.entity.position.offset(dx, 0, dz);

  try {
    await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 1));
    console.log(`🚶 Roamed to (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)})`);
  } catch (err) {
    console.log(`❌ Roaming failed: ${err.message}`);
  }
}

async function mineBlock(pos) {
  const targetBlock = bot.blockAt(pos);
  if (!targetBlock) {
    console.log("⚠️ Block no longer exists.");
    return;  
  }

  if (!bot.canDigBlock(targetBlock)) {
    console.log("⚠️ Block is not diggable.");
    return;  
  }

  try {
    console.log(`🚶 Moving to block at ${pos}`);
    await bot.pathfinder.goto(new GoalBlock(pos.x, pos.y + 1, pos.z));n
    await bot.dig(targetBlock);  
    console.log(`🪓 Mined block at ${pos}`);
  } catch (err) {
    console.log(`❌ Mining failed: ${err.message}`);
  }
}

function hasAxe() {
  const tools = ['stone_axe', 'iron_axe', 'diamond_axe', 'netherite_axe'];
  return bot.inventory.items().some(item => tools.includes(item.name));
}

async function equipAxe() {
  const tools = ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe'];
  const axe = bot.inventory.items().find(item => tools.includes(item.name));
  if (axe) {
    try {
      await bot.equip(axe, 'hand');
      console.log(`🪓 Equipped ${axe.name}`);
    } catch (err) {
      console.error('❌ Failed to equip axe:', err);
    }
  }
}

async function collectWood(targetCount = 64) {
  await equipAxe();

  const minedPositions = new Set();
  const MAX_SKIP = 10;

  async function loop() {
    if (isCancelled) return console.log("⛔ Wood collection cancelled.");

    await collectNearbyDrops();

    const logItemNames = Object.keys(mcData.itemsByName).filter(name =>
      name.endsWith('_log') && !name.includes('stripped')
    );
    const logItemIDs = logItemNames.map(name => mcData.itemsByName[name]?.id).filter(Boolean);
    const currentLogCount = bot.inventory.items()
      .filter(item => logItemIDs.includes(item.type))
      .reduce((sum, item) => sum + item.count, 0);

    if (currentLogCount >= targetCount) {
      bot.chat(`✅ Collected ${currentLogCount} logs.`);
      return;
    }

    const logBlockIDs = Object.keys(mcData.blocksByName)
    .filter(name => name.endsWith('_log') && !name.includes('stripped'))
    .map(name => mcData.blocksByName[name].id);  

    const targets = bot.findBlocks({
      matching: logBlockIDs,
      maxDistance: 32,
      count: 32
    });

    if (targets.length === 0) {
      console.log("🧭 No logs found nearby. Roaming...");
      await roamAround(15);
      setTimeout(loop, 1000);
      return;
    }
    

    let skipCounter = 0;

    for (const pos of targets) {
      const key = pos.toString();
      if (minedPositions.has(key)) continue;
    
      const block = bot.blockAt(pos);
      if (!block || block.name.includes('leaves') || block.boundingBox === 'empty' || !bot.canDigBlock(block)) {
        console.log("⚠️ Block not diggable or missing.");
        skipCounter++;
        if (skipCounter >= MAX_SKIP) {
          console.log("🔁 Too many invalid blocks. Roaming...");
          await roamAround(10);
          break;
        }        
        continue;
      }
    
      minedPositions.add(key);
    
      try {
        await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1));
        await mineBlock(pos);
        await bot.waitForTicks(5);
      } catch (err) {
        console.log(`❌ Mining failed: ${err.message}`);
      }
    
      break; 
    }

    setTimeout(loop, 500);
  }
  loop();
}

async function collectNearbyDrops() {
  const now = Date.now();
  if (now - lastPickUpTime < pickUpCooldown) return;

  const items = Object.values(bot.entities).filter(
    e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 5
  );

  for (const item of items) {
    try {
      await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
      await bot.pickUp(item);
      console.log(`🎒 Picked up item at ${item.position}`);
      lastPickUpTime = now;
    } catch (err) {
      console.log(`❌ Pickup failed at ${item.position}:`, err.message);
    }
  }
}

async function depositToChest() {
  const chestBlock = bot.findBlock({
    matching: mcData.blocksByName.chest.id,
    maxDistance: 10
  });

  if (!chestBlock) {
    bot.chat("❌ No chest nearby.");
    return;
  }

  try {
    await bot.pathfinder.goto(new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1));
    const chest = await bot.openChest(chestBlock);

    const logs = bot.inventory.items().filter(i => i.name.includes('log'));

    if (logs.length === 0) {
      bot.chat("📭 No logs to deposit.");
      return;
    }

    for (const log of logs) {
      await chest.deposit(log.type, null, log.count);
      console.log(`✅ Deposited ${log.count} ${log.name}`);
    }

    await chest.close();
    bot.chat("📦 Logs deposited.");
  } catch (err) {
    bot.chat("❌ Failed to deposit logs.");
    console.error("❌ Deposit error:", err);
  }
}

function directionToVector(dir) {
  if (dir > 5 || dir < 0) return null
  const faces = [
    new Vec3(0, -1, 0),
    new Vec3(0, 1, 0),
    new Vec3(0, 0, -1),
    new Vec3(0, 0, 1),
    new Vec3(-1, 0, 0),
    new Vec3(1, 0, 0)
  ]
  return faces[dir]
}

function rayTraceEntitySight(entity) {
  if (!bot.world?.raycast) throw Error('bot.world.raycast does not exist. Update prismarine-world.')
  const { height, position, yaw, pitch } = entity
  const dir = new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
  const targetBlock = bot.world.raycast(position.offset(0, height, 0), dir, 120)

  if (!targetBlock) {
    console.log('No block found in line of sight.')
  } else {
    console.log('Detected block:', targetBlock.name)
  }

  return targetBlock
}

