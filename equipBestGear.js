const armorSlots = ['helmet', 'chestplate', 'leggings', 'boots'];
const armorTypes = {
  helmet: ['netherite_helmet', 'diamond_helmet', 'iron_helmet', 'chainmail_helmet', 'golden_helmet', 'turtle_helmet', 'leather_helmet'],
  chestplate: ['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate', 'chainmail_chestplate', 'golden_chestplate', 'leather_chestplate'],
  leggings: ['netherite_leggings', 'diamond_leggings', 'iron_leggings', 'chainmail_leggings', 'golden_leggings', 'leather_leggings'],
  boots: ['netherite_boots', 'diamond_boots', 'iron_boots', 'chainmail_boots', 'golden_boots', 'leather_boots']
};

const slotMap = {
  helmet: 'head',
  chestplate: 'torso',
  leggings: 'legs',
  boots: 'feet'
};

async function equipBestGear(bot) {
  for (const slot of armorSlots) {
    const destSlot = slotMap[slot]; // map to correct destination name
    const current = bot.inventory.slots[bot.getEquipmentDestSlot(destSlot)];
    const bestItem = findBestArmor(bot, slot, current);
    if (bestItem) {
      try {
        await bot.equip(bestItem, destSlot);
        // bot.chat(`🛡️ Equipped better ${slot}: ${bestItem.name}`);
        console.log(`🛡️ Equipped better ${slot}: ${bestItem.name}`);
      } catch (err) {
        console.log(`⚠️ Could not equip ${slot}: ${err.message}`);
      }
    }
  }

  const bestWeapon = findBestWeapon(bot);
  if (bestWeapon) {
    try {
      await bot.equip(bestWeapon, 'hand');
      console.log(`⚔️ Equipped better weapon: ${bestWeapon.name}`);
    } catch (err) {
      console.log(`⚠️ Could not equip weapon: ${err.message}`);
    }
  }
}

function findBestArmor(bot, slot, currentItem) {
  const candidates = bot.inventory.items().filter(item =>
    armorTypes[slot].includes(item.name)
  );

  candidates.sort((a, b) =>
    armorTypes[slot].indexOf(a.name) - armorTypes[slot].indexOf(b.name)
  );

  if (candidates.length === 0) return null;

  if (!currentItem) return candidates[0];

  const currentIndex = armorTypes[slot].indexOf(currentItem.name);
  const bestIndex = armorTypes[slot].indexOf(candidates[0].name);
  return bestIndex < currentIndex ? candidates[0] : null;
}

function findBestWeapon(bot) {
  const weaponPriority = [
    'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
    'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'
  ];

  const candidates = bot.inventory.items().filter(item =>
    weaponPriority.includes(item.name)
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) =>
    weaponPriority.indexOf(a.name) - weaponPriority.indexOf(b.name)
  );

  return candidates[0];
}

module.exports = {
  equipBestGear,
};
