// ----- Config -----
const START_HP = 100;
const RESPAWN_HP = 50;      // when HP hits 0, come back to this
const XP_PER_HIT = 10;      // attacker XP for a valid attack

// ----- State -----
let teams = [
  { id: 1, hp: START_HP, xp: 0 },
  { id: 2, hp: START_HP, xp: 0 },
  { id: 3, hp: START_HP, xp: 0 },
  { id: 4, hp: START_HP, xp: 0 }
];

// ----- Helpers -----
const $ = sel => document.querySelector(sel);

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function damageFromRoll(roll) {
  if (roll === 1) return 0;       // miss
  if (roll === 6) return 10;      // crit
  return roll;                    // 2-5 damage
}

function getTeamById(id) {
  return teams.find(t => t.id === id);
}

function updateUI() {
  teams.forEach(t => {
    const hpEl = document.getElementById(`hp${t.id}`);
    const xpEl = document.getElementById(`xp${t.id}`);
    if (hpEl) hpEl.textContent = t.hp;
    if (xpEl) xpEl.textContent = t.xp;
  });

  // keep the target list in sync with last clicked attacker
  // (basic MVP: the teacher changes the dropdown manually as needed)
}

function log(msg) {
  const logEl = $("#log");
  const line = document.createElement("div");
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function validTarget(attackerId, targetId) {
  if (attackerId === targetId) return false;
  return [1,2,3,4].includes(targetId);
}

// ----- Core actions -----
function attack(attackerId) {
  const targetSelect = $("#targetSelect");
  let targetId = parseInt(targetSelect.value, 10);

  // If attacker is not Team 1, make sure dropdown doesn't accidentally point at self:
  if (!validTarget(attackerId, targetId)) {
    // pick first valid target not equal to attacker
    const candidates = [1,2,3,4].filter(id => id !== attackerId);
    targetId = candidates[0];
  }

  // Ensure dropdown never shows the attacker as a target
  normalizeTargetDropdown(attackerId);

  const attacker = getTeamById(attackerId);
  const target = getTeamById(targetId);

  if (!attacker || !target) return;

  const roll = rollDie();
  const dmg = damageFromRoll(roll);

  target.hp -= dmg;
  if (dmg > 0) attacker.xp += XP_PER_HIT;

  if (target.hp <= 0) {
    target.hp = RESPAWN_HP;
    log(`${teamName(attackerId)} rolled ${roll} for ${dmg} dmg and KO’d ${teamName(targetId)}! They respawn at ${RESPAWN_HP} HP.`);
  } else {
    if (dmg === 0) {
      log(`${teamName(attackerId)} rolled ${roll}. Miss!`);
    } else if (roll === 6) {
      log(`${teamName(attackerId)} rolled ${roll}. CRIT for 10! ${teamName(targetId)} now at ${target.hp} HP.`);
    } else {
      log(`${teamName(attackerId)} rolled ${roll} for ${dmg} dmg on ${teamName(targetId)} (HP ${target.hp}).`);
    }
  }

  updateUI();
}

function useItem(teamId) {
  // Placeholder for future items (disabled in MVP)
  log(`${teamName(teamId)} tried to use an item—but items are coming in the next version!`);
}

function hardReset() {
  teams = teams.map(t => ({ ...t, hp: START_HP, xp: 0 }));
  $("#log").innerHTML = "";
  updateUI();
  log("Game reset. All teams at 100 HP and 0 XP.");
}

function teamName(id) {
  const card = document.querySelector(`.team[data-id="${id}"] h2`);
  return card ? card.textContent.trim() : `Team ${id}`;
}

function normalizeTargetDropdown(attackerId) {
  const sel = $("#targetSelect");
  // If dropdown currently points to the attacker, move it to the next team
  if (parseInt(sel.value, 10) === attackerId) {
    const next = [1,2,3,4].find(id => id !== attackerId);
    sel.value = String(next);
  }
}

// Init
updateUI();
log("Welcome! Click a team's Attack button after a correct answer, choose a target, and watch the log.");
