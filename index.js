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
// const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const fs = require('fs');
// const util = require('util');
// const readFile = util.promisify(fs.readFile);
// const { parse } = require('prismarine-nbt');
const path = require('path');
const { status } = require('minecraft-server-util');
// const schematicModule = require('prismarine-schematic');

// const mcData = require('minecraft-data');
// const prismarineBiome = require('prismarine-biome');
// const mcDataLoader = require('minecraft-data');

// console.log(schematicModule);

// const { loadSchematic } = schematicModule;

// import { AutoBuilder } from 'mineflayer-builder'; // optional smart builder helper
const SERVER_HOST = 'The_Boyss.aternos.me'; // Replace with your server's IP or hostname
const SERVER_PORT = 34796;
const BOT_USERNAME = 'Aisha';

let bot = null;
let checkInterval = null;
let inactivityTimer = null;

function pingServerAndDecide() {
  status(SERVER_HOST, SERVER_PORT)
    .then(response => {
      const players = response.players?.sample || [];
      const realPlayers = players.filter(p => p.name !== BOT_USERNAME);

      console.log(`[Ping] Found ${realPlayers.length} real players online:`, realPlayers.map(p => p.name));

      if (!bot && realPlayers.length > 0) {
        console.log("🎮 Players detected. Joining server...");
        startBot();
      }
    })
    .catch(() => {
      console.log("❌ Server offline.");
      stopBot(); // optional
    });
}

// Start ping loop every 30 seconds
checkInterval = setInterval(pingServerAndDecide, 30_000);

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
    console.log("🔌 Bot disconnected.");
    bot = null;
  });

  bot.on('error', (err) => {
    console.log("❗ Bot error:", err.message);
  });  

  bot.once('spawn', async () => {
  try {
    // Ensure mcData and registry are properly loaded
    // if (!mcData || !mcData.registry || !mcData.registry.biomes) {
    //   console.error('Error: Could not load Minecraft data or biome registry.');
    //   return;
    // }

    // const biomes = mcData.registry.biomes;
    // console.log('Loaded biomes:', biomes);

    // Initialize prismarineBiome with the correct mcData version
    // const biomeHandler = prismarineBiome(mcData.registry); // Pass the loaded registry
    // console.log('Biome handler initialized.');

    // console.log('Bot version:', bot.version);
    // console.log('Minecraft data version:', mcData.version);
    mcData = require('minecraft-data')(bot.version);

    // Wait for inventory to be loaded
    await bot.waitForChunksToLoad?.();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const defaultMove = new Movements(bot);
    defaultMove.allow1by1towers = true;
    defaultMove.canDig = true;
    defaultMove.scafoldingBlocks = [];
    bot.pathfinder.setMovements(defaultMove);

    // Load auto-eat plugin
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

    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString();
      console.log('📩 Server says:', msg);
    });

    // bot.on('chat', (username, message) => {
    //   if (username !== bot.username) {
    //     console.log(`💬 ${username}: ${message}`);
    //   }
    // });

    // Safer event logs
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
        // Recreate the bot here
      }, 5000);
    });



bot.on('chat', async (username, message) => {
  if (username === bot.username) return; // Ignore bot's own messages
  console.log(`💬 ${username}: ${message}`);
  
  // Respond to !chat messages (casual conversation)
  if (message.startsWith('!chat ')) {
    const query = message.slice(6).trim();
    // bot.chat('🧠 Thinking...');
    await chatWithAI(query);
  }

  // // Respond to !cmd messages (direct commands for actions)
  // if (message.startsWith('!cmd ')) {
  //   const instruction = message.slice(5).trim();
  //   bot.chat('⚙️ Processing command...');
  //   await chatWithAI(instruction);
  // }
  
  // Check if the message starts with '!' and remove it for easier processing
  if (!message.startsWith('!')) return; // Ignore messages without the '!' prefix
  const cmd = message.slice(1).trim().toLowerCase(); // Get the command by removing '!' and making it lowercase

  if (cmd === 'help') {
    bot.chat('📜 Commands 1/2: !come | !follow | !avoid | !stop | !collect wood | !put in chest');
    setTimeout(() => {
      bot.chat('📜 Commands 2/2: !goto x y z | !break | !place <item> | !deliver | !chat <msg>');
    }, 1000);
  }

  // Build schematic command fs.readFile
  // if (cmd.startsWith('build')) {
  //   const coords = cmd.split(' ').slice(1); // Get x and z coordinates
  //   if (coords.length !== 2) {
  //     return bot.chat('❌ Please provide both X and Z coordinates for the center!');
  //   }

  //   const [x, z] = coords.map(Number);
  //   if (isNaN(x) || isNaN(z)) {
  //     return bot.chat('❌ Invalid coordinates provided!');
  //   }

  //   bot.chat('📦 Starting to build schematic...');
    
  //   // Load the schematic (ensure you replace with your path and file)
  //   // const schematicPath = './schematics/sayan_gamer123.schematic'; // Replace with your schematic file path
  //   // const schematic = await Schematic.read(await fs.promises.readFile(schematicPath));
    
  //   // Check the items required for the schematic
  //   const requiredItems = getRequiredBlocks(schematic);

  //   // Try to find a chest nearby to gather the needed items
  //   const chest = findNearestChest();
  //   if (!chest) {
  //     return bot.chat('No chest found nearby to gather items from!');
  //   }

  //   // Withdraw the required items from the chest
  //   const success = await withdrawNeededItems(requiredItems, chest);
  //   if (!success) {
  //     return bot.chat('Could not gather all required items!');
  //   }

  //   bot.chat('🧮 All items gathered, starting to build...');
    
  //   // Calculate the origin based on provided x, z, and the schematic's height
  //   const origin = new Vec3(x, bot.entity.position.y, z); // y is kept at bot's current position for now 💬 
  //   await buildSchematic(schematic, origin);
  //   bot.chat('🏗️ Schematic built successfully!');
  // }

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
          // Silently ignore transfer errors
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

    // Load and use the schematic
    // const schematicData = await fs.readFile('./schematics/sayan_gamer123.schem');
    // const schematic = await Schematic.read(schematicData);

    // console.log('✅ Schematic loaded successfully.');

    console.log('✅ Bot spawned and ready.');
  } catch (err) {
    console.error('🚨 Error during spawn setup:', err);
  }
  });
  
  // Inactivity check every 10 sec status
  setInterval(() => {
    if (!bot?.players) return;

    const otherPlayers = Object.values(bot.players)
      .filter(p => p.username !== BOT_USERNAME && p.entity);

    if (otherPlayers.length === 0) {
      if (!inactivityTimer) {
        console.log("🕒 No players detected. Starting 60s timer...");
        inactivityTimer = setTimeout(() => {
          console.log("⏹️ No players joined. Disconnecting bot.");
          stopBot();
        }, 60_000);
      }
    } else {
      if (inactivityTimer) {
        console.log("🟢 Players returned. Clearing inactivity timer.");
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    }
  }, 10_000);
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



let mcData;
// let schematic;

// Auto-register/login
// const REGISTER_CMD = '/register strongPassword123 strongPassword123';
// const LOGIN_CMD = '/login strongPassword123';

// const mcData = require('minecraft-data')(bot.version); // Ensure this is properly initialized with the correct version










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
  // } else {
  //   bot.chat("🤖 That doesn't sound like a Minecraft action.");
  // }
  }
}

// Make sure prismarine-biome and prismarine-block are properly initialized
// const prismarineBiome = require('prismarine-biome')(mcData.version);
// const prismarineBlock = require('prismarine-block')(mcData.versions);

// Function to load the schematic file
// async function loadSchematicFile(path) {
//   try {
//     console.log('📦 Loading schematic...');
//     const fileBuffer = await readFile(path);
    
//     // Parse NBT data from file
//     const nbtData = await parse(fileBuffer);
    
//     // Initialize the schematic with biome and block data
//     const schematic = new Schematic(nbtData, prismarineBiome, prismarineBlock);
    
//     console.log('✅ Schematic loaded successfully!');
    
//     // Return schematic for use in your bot
//     return schematic;
//   } catch (error) {
//     console.error('❌ Error loading schematic:', error);
//     throw error;
//   }
// }

// Example: Load a schematic from a file path
// loadSchematicFile('./schematics/name.schem');

function findNearestTrappedChest() {
  return bot.findBlock({
    matching: block => block.name === 'trapped_chest',
    maxDistance: 64
  })
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

let isCancelled = false;

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
  
let lastPickUpTime = 0;
const pickUpCooldown = 5000;

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

// ----------------------------------------Schematic Builder----------------------------------------
// function getRequiredBlocks(schematic) {
//   const requiredItems = [];

//   // Iterate through the blocks in the schematic and get the required block types
//   for (let i = 0; i < schematic.blocks.length; i++) {
//     const blockId = schematic.blocks[i];
//     const block = schematic.palette[blockId];
//     if (!requiredItems.includes(block)) {
//       requiredItems.push(block);
//     }
//   }

//   return requiredItems;
// }

// function findNearestChest() {
//   const chestId = mcData.blocksByName.chest.id;

//   const chests = bot.findBlocks({
//     matching: chestId,
//     maxDistance: 32,
//     count: 1
//   });

//   if (chests.length === 0) return null;
//   console.log('🔍 Looking for chests with ID:', chestId);

//   return bot.blockAt(chests[0]);
  
// }


// async function withdrawNeededItems(requiredItems, chest) {
//   const chestWindow = await bot.openBlock(chest);
  
//   // Iterate over each required item and ensure the bot has it in its inventory
//   for (const item of requiredItems) {
//     let hasItem = bot.inventory.items().some(i => i.name === item);

//     if (!hasItem) {
//       const chestItems = chestWindow.slots.filter(i => i && i.name === item);

//       if (chestItems.length > 0) {
//         // Transfer item to bot inventory
//         await bot.transfer({
//           window: chestWindow,
//           itemType: chestItems[0].type,
//           metadata: chestItems[0].metadata,
//           sourceStart: 0,
//           sourceEnd: chestWindow.slots.length,
//           destStart: bot.inventory.inventoryStart,
//           destEnd: bot.inventory.inventoryEnd
//         });
//       } else {
//         bot.chat(`❌ Missing required item: ${item}`);
//         chestWindow.close();
//         return false; // Failed to withdraw all required items
//       }
//     }
//   }

//   chestWindow.close();
//   return true; // Successfully withdrew all required items
// }

// async function buildSchematic(schematic, origin) {
//   for (let i = 0; i < schematic.blocks.length; i++) {
//     const blockId = schematic.blocks[i];
//     const block = schematic.palette[blockId];

//     // Calculate the position for placing this block
//     const position = origin.offset(i % schematic.size.x, Math.floor(i / schematic.size.x) % schematic.size.y, Math.floor(i / (schematic.size.x * schematic.size.y)) % schematic.size.z);

//     // Build the block at the given position
//     await bot.placeBlock(position, block); // This assumes `block` can be placed directly
//   }
// }

