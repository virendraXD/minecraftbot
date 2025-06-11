const { Vec3 } = require('vec3');
const { GoalBlock, GoalLookAtBlock } = require('mineflayer-pathfinder').goals;

let bot;
let mining = false;

function setupMining(botInstance) {
  bot = botInstance;
  bot.loadPlugin(require('mineflayer-pathfinder').pathfinder);
}

async function startMining(username) {
  const player = bot.players[username]?.entity;
  if (!player) {
    bot.chat(`❗ Cannot find player ${username}`);
    return;
  }

  const playerPos = player.position.floored();
  await bot.pathfinder.goto(new GoalBlock(playerPos.x, playerPos.y, playerPos.z));

  mining = true;
  bot.chat(`⛏️ Started mining.`);
  mineNext(player);
}

function stopMining() {
  mining = false;
  bot.pathfinder.setGoal(null);
  bot.chat(`🛑 Stopped mining.`);
}

async function mineNext(player) {
  if (!mining) return;

  const targetBlock = rayTraceEntitySight(player);
  if (targetBlock && bot.canDigBlock(bot.blockAt(targetBlock.position))) {
    try {
      // ➔ Use GoalLookAtBlock for stable head rotation
      await bot.pathfinder.goto(new GoalLookAtBlock(targetBlock.position, bot.world, { range: 4 }));

      const bestTool = bot.pathfinder.bestHarvestTool(bot.blockAt(targetBlock.position));
      if (bestTool) await bot.equip(bestTool, 'hand');

      await bot.dig(bot.blockAt(targetBlock.position));
      setImmediate(() => mineNext(player)); // Repeat immediately
    } catch (err) {
      console.error('❗ Digging error:', err.message);
      setImmediate(() => mineNext(player)); // Continue trying
    }
  } else {
    setImmediate(() => mineNext(player)); // Keep searching if nothing to dig
  }
}

function rayTraceEntitySight(entity) {
  if (!bot.world?.raycast) throw Error('bot.world.raycast does not exist. Update prismarine-world.');
  const { height, position, yaw, pitch } = entity;
  const dir = new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return bot.world.raycast(position.offset(0, height, 0), dir, 120);
}

module.exports = {
  setupMining,
  startMining,
  stopMining
};
