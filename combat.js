const { Vec3 } = require('vec3');

let bot;
let mcData;
let currentTarget = null;
let allowedCommandUsers = [];

let calmed = false;
let lastWarningTime = 0;
let lastHelpCallTime = 0;

const WARNING_COOLDOWN = 10 * 1000; // 10 sec
const HELP_CALL_COOLDOWN = 15 * 1000; // 15 sec 

function setupCombat(botInstance, mcDataInstance, allowedUsers = []) {
  bot = botInstance;
  mcData = mcDataInstance;
  allowedCommandUsers = allowedUsers;

  // Handle "!calm" command
  bot.on('chat', (username, message) => {
    if (message === '!calm' && allowedCommandUsers.includes(username)) {
      bot.pvp.stop();
      currentTarget = null;
      calmed = true;
      bot.chat('🕊️ Calming down...');
    }
  });

  // Reset calm state when attacked again
  bot.on('entityHurt', (entity) => {
    if (entity.username === bot.username) {
      const attacker = bot.nearestEntity(e =>
        e.type === 'player' &&
        e.username !== bot.username &&
        e.position.distanceTo(bot.entity.position) < 5
      );

      if (attacker) {
        calmed = false; // Not calm anymore if hurt
        currentTarget = attacker;

        const now = Date.now();
        if (now - lastHelpCallTime >= HELP_CALL_COOLDOWN) {
          const pos = attacker.position;
          bot.chat(`🆘 Help! ${attacker.username} attacked me at X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)}!`);
          lastHelpCallTime = now;
        }

        bot.pvp.attack(attacker);
      }
    }
  });

  // Warn when player swings too close — but don't attack
bot.on('entitySwingArm', (entity) => {
  if (calmed) return;

  if (entity.type === 'player' && entity.username !== bot.username) {
    const distance = bot.entity.position.distanceTo(entity.position);

    // Safely check for lookVector
    if (!entity.lookVector) return;

    const directionToBot = bot.entity.position.minus(entity.position).normalize();
    const playerView = entity.lookVector;

    const dotProduct = directionToBot.dot(playerView);

    if (distance < 3 && dotProduct > 0.7) {
      sendWarningMessage(entity.username);
    }
  }
});

}

// Handles warning cooldown
function sendWarningMessage(attackerUsername) {
  const now = Date.now();
  if (now - lastWarningTime >= WARNING_COOLDOWN) {
    bot.chat(`😡 Watch it, ${attackerUsername}!`);
    lastWarningTime = now;
  }
}

module.exports = {
  setupCombat
};
