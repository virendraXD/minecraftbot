const { Vec3 } = require('vec3');
const fs = require('fs');
const path = require('path');

let bot;
let mcData;
let currentTarget = null;
let allowedCommandUsers = [];

const WARNING_COOLDOWN = 10 * 1000;
const HELP_CALL_COOLDOWN = 15 * 1000;

let calmed = false;
let lastWarningTime = 0;
let lastHelpCallTime = 0;

const trueFriends = new Set();
const friends = new Set();
const bullies = new Set();

const playerDataPath = path.join(__dirname, 'players.json');

let allowFightWithOwner = false; // Default = false

// Load player data from file
function loadPlayerData() {
  if (fs.existsSync(playerDataPath)) {
    try {
      const data = fs.readFileSync(playerDataPath);
      const obj = JSON.parse(data);
      obj.trueFriends?.forEach(p => trueFriends.add(p));
      obj.friends?.forEach(p => friends.add(p));
      obj.bullies?.forEach(p => bullies.add(p));
      allowFightWithOwner = obj.allowFightWithOwner ?? false;
    } catch (err) {
      console.error("Error loading players.json:", err.message);
    }
  }
}

function savePlayerData() {
  const data = {
    trueFriends: [...trueFriends],
    friends: [...friends],
    bullies: [...bullies],
    allowFightWithOwner
  };
  fs.writeFileSync(playerDataPath, JSON.stringify(data, null, 2));
}

function setupCombat(botInstance, mcDataInstance, allowedUsers = []) {
  bot = botInstance;
  mcData = mcDataInstance;
  allowedCommandUsers = allowedUsers;

  loadPlayerData();

  bot.on('chat', handleChatCommands);
  bot.on('entityHurt', handleEntityHurt);
  bot.on('entitySwingArm', handleSwingArm);
}

function handleChatCommands(username, message) {
  if (!allowedCommandUsers.includes(username)) return;

  const args = message.trim().split(' ');
  const command = args.shift().toLowerCase();

  if (command === '!calm') {
    calmed = true;
    bot.pvp.stop();
    currentTarget = null;
    bot.chat('🕊️ Calming down...');
  } else if (command === '!fightowner') {
    allowFightWithOwner = !allowFightWithOwner;
    savePlayerData();
    bot.chat(`👑 Fight with owner is now ${allowFightWithOwner ? 'ENABLED ⚔️' : 'DISABLED 🛡️'}`);
  } else if (command === '!addfriend' && args[0]) {
    friends.add(args[0]);
    savePlayerData();
    bot.chat(`✅ Added ${args[0]} to friends.`);
  } else if (command === '!removefriend' && args[0]) {
    friends.delete(args[0]);
    savePlayerData();
    bot.chat(`❎ Removed ${args[0]} from friends.`);
  } else if (command === '!addbully' && args[0]) {
    bullies.add(args[0]);
    savePlayerData();
    bot.chat(`⚠️ Added ${args[0]} to bullies.`);
  } else if (command === '!removebully' && args[0]) {
    bullies.delete(args[0]);
    savePlayerData();
    bot.chat(`❎ Removed ${args[0]} from bullies.`);
  } else if (command === '!addtruefriend' && args[0]) {
    trueFriends.add(args[0]);
    savePlayerData();
    bot.chat(`💙 Added ${args[0]} to true friends.`);
  } else if (command === '!removetruefriend' && args[0]) {
    trueFriends.delete(args[0]);
    savePlayerData();
    bot.chat(`❎ Removed ${args[0]} from true friends.`);
  } else if (command === '!listcategories') {
    bot.chat( `📜 TF: ${[...trueFriends].join(', ') || '<none>'} | F: ${[...friends].join(', ') || '<none>'} | B: ${[...bullies].join(', ') || '<none>'}`);
  } else if (command === '!reloadcombat') {
    loadPlayerData();
    bot.chat('🔄 Reloaded combat settings.');
  }
}

function isProtectedPlayer(username) {
  if (!allowFightWithOwner && username === process.env.OWNER_USERNAME) return true;
  return trueFriends.has(username);
}

function handleEntityHurt(entity) {
  if (entity.username !== bot.username) return;

  const attacker = bot.nearestEntity(e =>
    e.type === 'player' &&
    e.username !== bot.username &&
    e.position.distanceTo(bot.entity.position) < 6
  );

  if (!attacker || isProtectedPlayer(attacker.username)) return;

  calmed = false;
  currentTarget = attacker;

  if (bullies.has(attacker.username)) {
    bot.chat(`⚔️ Engaging ${attacker.username} (Bully)!`);
    bot.pvp.attack(attacker);
  } else if (friends.has(attacker.username)) {
    sendWarningMessage(attacker.username);
  } else {
    callForHelp(attacker);
    bot.pvp.attack(attacker);
  }
}

function handleSwingArm(entity) {
  if (calmed || !entity.username || isProtectedPlayer(entity.username)) return;

  const distance = bot.entity.position.distanceTo(entity.position);
  if (distance > 3 || !entity.lookVector) return;

  const directionToBot = bot.entity.position.minus(entity.position).normalize();
  const dotProduct = directionToBot.dot(entity.lookVector);

  if (dotProduct > 0.7) {
    if (bullies.has(entity.username)) {
      bot.pvp.attack(entity);
    } else {
      sendWarningMessage(entity.username);
    }
  }
}

function sendWarningMessage(username) {
  const now = Date.now();
  if (now - lastWarningTime >= WARNING_COOLDOWN) {
    bot.chat(`😠 Careful, ${username}!`);
    lastWarningTime = now;
  }
}

function callForHelp(attacker) {
  const now = Date.now();
  if (now - lastHelpCallTime >= HELP_CALL_COOLDOWN) {
    const pos = attacker.position;
    bot.chat(`🆘 Help! ${attacker.username} attacked me at X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)}!`);
    lastHelpCallTime = now;
  }
}

module.exports = {
  setupCombat
};
