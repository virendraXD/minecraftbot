require('dotenv').config();

const axios = require('axios');
const mineflayer = require('mineflayer');
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

const SERVER_HOST = 'The_Boyss.aternos.me'; // Replace with your server's IP or hostname
const SERVER_PORT = 34796;
const BOT_USERNAME = 'Aisha';
const pickUpCooldown = 5000;

let bot = null;
// let checkInterval = null;
let inactivityTimer = null;
let lastPlayerActivity = Date.now(); // Track last real player activity
let lastActivity = Date.now(); // initialize with current time
let mcData;
let isCancelled = false;  
let lastPickUpTime = 0;
let checkInterval;


function pingServerAndDecide() {
  status(SERVER_HOST, SERVER_PORT)
    .then(response => {
      const players = response.players?.sample || [];
      const realPlayers = players.filter(p => p.name !== BOT_USERNAME);

      console.log(`[Ping] Found ${realPlayers.length} real players online:`, realPlayers.map(p => p.name));

      if (!bot && realPlayers.length > 0) {
        console.log("🎮 Players detected. Joining server...");
        startBot();
      } else if (bot && realPlayers.length > 0) {
        // Reset activity time if bot is already running
        lastPlayerActivity = Date.now();
      }
    })
    .catch(() => {
      console.log("❌ Server offline.");
      stopBot(); // optional
    });
}

let playerCheckInterval;
let playerRetryAttempts = 0;
const MAX_RETRIES = 3; // Number of retries before quitting

function startPlayerCheckLoop() {
  if (playerCheckInterval) clearInterval(playerCheckInterval);

  playerCheckInterval = setInterval(() => {
    const playersOnline = Object.values(bot.players).filter(p => !p.bot);
    const realPlayerNames = playersOnline.map(p => p.username);

    console.log(`[Ping] Found ${realPlayerNames.length} real players online: ${JSON.stringify(realPlayerNames)}`);

    if (realPlayerNames.length > 0) {
      clearInterval(playerCheckInterval);
      playerRetryAttempts = 0;
      console.log("✅ Real players detected. Continuing bot tasks...");
      // Continue bot behavior here
    } else {
      playerRetryAttempts++;
      console.log(`No players online. Attempt ${playerRetryAttempts}/${MAX_RETRIES}`);

      if (playerRetryAttempts >= MAX_RETRIES) {
        clearInterval(playerCheckInterval);
        console.log("🚫 Max retries reached. Disconnecting bot...");
        bot.quit();
      }
    }
  }, 10000); // Check every 10 seconds
}

// bot.on('spawn', () => {
//   console.log("✅ Bot spawned and ready.");
//   startPlayerCheckLoop();
// });

// bot.on('end', () => {
//   console.log("🔌 Bot disconnected. Attempting to reconnect...");
//   setTimeout(createBot, 5000);
// });


// Start ping loop every 30 seconds
checkInterval = setInterval(pingServerAndDecide, 30_000);

setInterval(() => {
  const now = Date.now();
  const timeSinceLastActivity = (now - lastActivity) / 1000; // in seconds

  if (timeSinceLastActivity > 300) { // e.g. 5 minutes
    console.log("No activity detected for 5 minutes. Doing something...");
    // take action (like saving state, reconnecting, etc.)
  }
}, 60 * 1000); // check every 1 minute
//inactivityTimer 
function startBot() {
  bot = mineflayer.createBot({
    host: SERVER_HOST,  //ip for aternos: knightbot.duckdns.org
    port: SERVER_PORT,        // port for aternos: 34796
    username: BOT_USERNAME,
    version: '1.20.1'
  });

  bot.loadPlugin(pathfinder);

  bot.on('login', () => {
    console.log("🤖 Bot joined.");
  });

  bot.on('end', () => {
    console.log("Bot disconnected. Clearing player check loop.");
    clearInterval(checkInterval);
    setTimeout(createBot, 5000);
  });

  bot.on('error', (err) => {
    console.log("❗ Bot error:", err.message);
  });  

  bot.once('spawn', async () => {
  try {
    startPlayerCheckLoop();
    console.log("Bot spawned. Starting player check loop.");
    checkInterval = setInterval(() => checkForPlayersAndQuit(bot), 30 * 1000);

    mcData = require('minecraft-data')(bot.version);

    // Wait for inventory to be loaded
    await bot.waitForChunksToLoad?.();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const defaultMove = new Movements(bot);
    defaultMove.allow1by1towers = true;
    defaultMove.canDig = true;
    defaultMove.scafoldingBlocks = [];
    bot.pathfinder.setMovements(defaultMove);

    // Load auto-eat plugin bot.on('c
    bot.loadPlugin(autoEat);
  
    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString().toLowerCase();
      const password = 'strongPassword123';
    
      if (msg.includes('/register')) {
        bot.chat(`/register ${password} ${password}`);
      } else if (msg.includes('/login')) {
        bot.chat(`/login ${password}`);
      }
    });

    let lastFoodRequest = 0;
    const FOOD_REQUEST_COOLDOWN = 30 * 1000; // 30 seconds

    bot.on('health', () => {
      if (bot.food < 14 && Date.now() - lastFoodRequest > FOOD_REQUEST_COOLDOWN) {
        bot.chat("🍗 I'm hungry! Please give me some food.");
        lastFoodRequest = Date.now();
      }
    
      // Only auto-eat if bot's food level is low and it has food in inventory 
      if (bot.food < 14 && bot.inventory.items().some(i => i.name.includes('bread') || i.name.includes('steak'))) {
        bot.chat("🍗 I'm hungry! Eating now.");
        bot.autoEat.enableAuto(); // Automatically start eating based on the options set
      }
    });

    bot.once('inventory', () => {
      bot.autoEat.enableAuto();
      bot.autoEat.options = {
        priority: 'auto',
        startAt: 16,
        bannedFood: [],
        healthThreshold: 14
      };
    });

    // bot.on('message', (jsonMsg) => {
    //   const msg = jsonMsg.toString();
    //   console.log('📩 Server says:', msg);
    // });

    // Safer event logs 💬 realPlayers.length
    bot.autoEat.on('eatStart', (item) => {
      console.log(`🍽️ Started eating ${item?.name || 'something (unknown)'}`);
    });

    bot.autoEat.on('eatFinish', (item) => {
      console.log(`✅ Finished eating ${item?.name || 'something (unknown)'}`);
    });

    bot.autoEat.on('eatFail', (error) => {
      console.error('❌ Eating failed:', error);
    });

    // Pathfinding logs 
    bot.on('path_update', (r) => {
      const nodesPerTick = (r.visitedNodes * 50 / r.time).toFixed(2);
      console.log(`📍 I can get there in ${r.path.length} moves. Computation took ${r.time.toFixed(2)} ms (${r.visitedNodes} nodes, ${nodesPerTick} nodes/tick)`);
    });

    bot.on('goal_reached', () => {
      console.log('🎯 Goal reached!');
    });

    bot.on('path_reset', (reason) => {
      console.log(`♻️ Path was reset for reason: ${reason}`);
    });

    bot.on('error', (err) => {
      console.error('❌ Bot error:', err);
    });

    bot.on('end', () => {
      console.log('🔌 Bot disconnected. Attempting to reconnect...');
      setTimeout(() => {
        console.log("🔁 Reconnecting bot...");
        startBot();
      }, 5000);
    });

bot.on('chat', async (username, message) => {
  if (username === bot.username) return; // Ignore bot's own messages jsonMsg
  lastPlayerActivity = Date.now(); // Reset activity timer on real player chat
  lastActivity = Date.now();
  console.log(`💬 ${username}: ${message}`);
  
  // Respond to !chat messages (casual conversation)
  if (message.startsWith('!chat ')) {
    const query = message.slice(6).trim();
    // bot.chat('🧠 Thinking...');
    await chatWithAI(query);
  }
  
  // Check if the message starts with '!' and remove it for easier processing bot.on('chat'
  if (!message.startsWith('!')) return; // Ignore messages without the '!' prefix
  const cmd = message.slice(1).trim().toLowerCase(); // Get the command by removing '!' and making it lowercase

  if (cmd === 'help') {
    bot.chat('📜 Commands 1/2: !come | !follow | !avoid | !stop | !collect wood | !put in chest');
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
    await collectWood(64); // Ensure this is an async function
  }

  if (cmd === 'put in chest') {
    await depositToChest(); // Ensure this is an async function message
  }

  if (cmd === 'getlocation') {
    const args = message.split(' ');
    const targetName = args[1];
    if (!targetName) {
      bot.chat('Usage: !getlocation <player>');
      return;
    }

    const target = bot.players[targetName]?.entity;
    if (!target) {
      bot.chat(`❌ Player "${targetName}" not found or not visible.`);
      return;
    }

    const pos = target.position;
    const world = target.world?.dimension || "unknown";

    bot.chat(`📍 ${targetName} is in "${world}" at X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`);
  }

  const target = bot.players[username]?.entity;

  if (cmd === 'come') {
    if (!target) return bot.chat("I don't see you!");
    const p = target.position;
    bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1));
  } else if (cmd.startsWith('goto')) {
    const args = cmd.split(' '); // Split the command to get coordinates
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

      // Only take items from non-hotbar inventory (slots 9+)
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
          // Silently ignore transfer errors realPlayers.length
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

    console.log('✅ Bot spawned and ready.');
  } catch (err) {
    console.error('🚨 Error during spawn setup:', err);
  }
  });
  
  // Inactivity check every 10 sec status targetName
// let inactivityTimer = null;
// let lastActivity = Date.now(); 

// Update activity on chat


// Update activity on player join
bot.on('playerJoined', (player) => {
  if (player.username !== bot.username) {
    console.log(`🎉 ${player.username} joined.`);
    lastActivity = Date.now();
  }
});

// Update activity on player movement entitygone
bot.on('entityMoved', (entity) => {
  if (
    entity.type === 'player' &&
    entity.username !== bot.username
  ) {
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

function checkForPlayersAndQuit(bot) {
  // If bot is disconnected or not ready, skip startPlayerCheckLoop
  if (!bot || !bot.players) {
    console.log("Bot not ready or disconnected. Skipping player check.");
    return;
  }

  const realPlayers = Object.values(bot.players).filter(
    (p) => p?.username && p.username !== bot.username
  );

  if (realPlayers.length === 0) {
    console.log("No players online. Quitting bot...");
    clearInterval(checkInterval); // stop checking Bot disconnected
    bot.quit();
  } else {
    console.log(`Players online: ${realPlayers.map(p => p.username).join(", ")}`);
  }
}


function stopBot() {
  if (bot) {
    bot.quit("No players online.");
    bot = null;
  }
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

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
    return;  // Block has been removed
  }

  if (!bot.canDigBlock(targetBlock)) {
    console.log("⚠️ Block is not diggable.");
    return;  // Block can't be dug (either not valid or not a diggable block)
  }

  try {
    console.log(`🚶 Moving to block at ${pos}`);
    await bot.pathfinder.goto(new GoalBlock(pos.x, pos.y + 1, pos.z));  // Move to the correct block position
    await bot.dig(targetBlock);  // Dig the block
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
  // if (!hasAxe()) {
  //   bot.chat("🪓 I need at least a stone axe to start chopping.");
  //   return;
  // }

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
    
      break; // After one valid mine, loop again
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
    console.log('Detected block:', targetBlock.name)  // Log the block detected
  }

  return targetBlock
}
