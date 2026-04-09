import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { AIRSHIP_TYPES, EMOJI_COLLECTION, INITIAL_CHARACTERS, LEAGUES, MainTowerTypeId } from '../constants';
import { ArrowLeft } from 'lucide-react';
import { playDeploySfx, playHitSfx, playMenuClick, unlockAudio } from '../audio';

type Team = 'player' | 'enemy';

interface Entity {
  id: string;
  type: 'unit' | 'tower' | 'projectile';
  team: Team;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  
  charId?: string;
  name?: string;
  level?: number;
  color?: string;
  damage?: number;
  charType?: 'Yakın Dövüş' | 'Uzak Menzil' | 'Tank' | 'Sıhhiyeci';
  speed?: number;
  range?: number;
  attackSpeed?: number;
  lastAttack?: number;
  targetId?: string | null;

  targetX?: number;
  targetY?: number;
  vx?: number;
  vy?: number;
  isMainTower?: boolean;
  healPerSecond?: number;
  healRadius?: number;
  sfxKey?: string;
  towerDamageMultiplier?: number;
  fxTier?: 'basic' | 'special';
  projectileColor?: string;
  pendingRequestId?: string;
  lifeRemaining?: number;
  bridgeLockX?: number;
  mainTowerType?: MainTowerTypeId;
  infernoTargetId?: string;
  infernoRamp?: number;
  lastSummonAt?: number;
  slowUntil?: number;
  slowFactor?: number;
  slowDurationMs?: number;
  burnRemainingMs?: number;
  burnDps?: number;
  freezeMarkMs?: number;
  towerFlameMarkMs?: number;
  burnDurationMs?: number;
  burnDpsOnHit?: number;
  isSummonedGuard?: boolean;
  sourceUnitId?: string;
  airshipHealRemainingMs?: number;
  airshipHealPerSecond?: number;
  shieldHp?: number;
  shieldMaxHp?: number;
}

interface ImpactFx {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

type ManualAbilityKind = 'arrow_rain' | 'fireball';
type AirshipAbilityKind = 'lockdown' | 'boost' | 'heal' | 'reflector' | 'shield';

type AirshipChargeState = Record<Team, Record<AirshipAbilityKind, number>>;

interface AirshipFeedback {
  team: Team;
  kind: AirshipAbilityKind;
  until: number;
}

interface PendingAbility {
  id: string;
  kind: ManualAbilityKind;
  team: Team;
  x: number;
  y: number;
  landsAt: number;
}

type SnapshotEntity = Pick<Entity,
  'id' | 'type' | 'team' | 'x' | 'y' | 'hp' | 'maxHp' | 'radius' |
  'name' | 'level' | 'color' | 'isMainTower' | 'projectileColor' | 'fxTier' | 'mainTowerType' | 'burnRemainingMs' | 'freezeMarkMs' | 'towerFlameMarkMs' | 'shieldHp' | 'shieldMaxHp'
>;

type SnapshotAbility = {
  id: string;
  kind: ManualAbilityKind;
  team: Team;
  x: number;
  y: number;
  landsAt: number;
};

const CANVAS_W = 400;
const CANVAS_H = 600;
const RIVER_TOP = CANVAS_H / 2 - 20;
const RIVER_BOTTOM = CANVAS_H / 2 + 20;
const RIVER_MID = (RIVER_TOP + RIVER_BOTTOM) / 2;
const LEFT_BRIDGE_X = 100;
const RIGHT_BRIDGE_X = 300;
const BRIDGE_HALF_WIDTH = 24;
const PRODUCTION_SPAWN_INTERVAL_MS = 8000;
const PRODUCTION_MAX_ACTIVE_GUARDS = 3;
const MANUAL_ABILITY_DELAY_MS = 1100;

const isOnBridge = (x: number) =>
  Math.abs(x - LEFT_BRIDGE_X) <= BRIDGE_HALF_WIDTH || Math.abs(x - RIGHT_BRIDGE_X) <= BRIDGE_HALF_WIDTH;

const isInRiver = (y: number) => y >= RIVER_TOP && y <= RIVER_BOTTOM;

const nearestBridgeX = (x: number) =>
  Math.abs(x - LEFT_BRIDGE_X) <= Math.abs(x - RIGHT_BRIDGE_X) ? LEFT_BRIDGE_X : RIGHT_BRIDGE_X;

const isNearRiverBand = (y: number, padding = 26) =>
  y >= RIVER_TOP - padding && y <= RIVER_BOTTOM + padding;

const applyRiverCornerSafety = (entity: Entity, _dt: number) => {
  // Keep only hard map bounds so units can path close to river edges.
  entity.x = Math.max(14, Math.min(CANVAS_W - 14, entity.x));
  entity.y = Math.max(14, Math.min(CANVAS_H - 14, entity.y));
};

const swapTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');

const mirrorForEnemyView = (entity: Entity): Entity => ({
  ...entity,
  x: CANVAS_W - entity.x,
  y: CANVAS_H - entity.y,
  team: swapTeam(entity.team),
  targetX: entity.targetX !== undefined ? CANVAS_W - entity.targetX : undefined,
  targetY: entity.targetY !== undefined ? CANVAS_H - entity.targetY : undefined,
  vx: entity.vx !== undefined ? -entity.vx : undefined,
  vy: entity.vy !== undefined ? -entity.vy : undefined,
});

const toSnapshotEntity = (entity: Entity): SnapshotEntity => ({
  id: entity.id,
  type: entity.type,
  team: entity.team,
  // Round coordinates to reduce payload size and serialization pressure on host.
  x: Math.round(entity.x * 10) / 10,
  y: Math.round(entity.y * 10) / 10,
  hp: Math.round(entity.hp * 10) / 10,
  maxHp: Math.round(entity.maxHp * 10) / 10,
  radius: entity.radius,
  name: entity.name,
  level: entity.level,
  color: entity.color,
  isMainTower: entity.isMainTower,
  projectileColor: entity.projectileColor,
  fxTier: entity.fxTier,
  mainTowerType: entity.mainTowerType,
  burnRemainingMs: entity.burnRemainingMs,
  freezeMarkMs: entity.freezeMarkMs,
  towerFlameMarkMs: entity.towerFlameMarkMs,
  shieldHp: entity.shieldHp,
  shieldMaxHp: entity.shieldMaxHp,
});

export default function Battle({ goBack, mode, peerConnection }: { goBack: () => void, mode: string, peerConnection: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    characters: playerCharacters,
    lp,
    towerLevels,
    selectedMainTowerType,
    selectedAirship,
    airshipLevels,
    ownedAirships,
    playerName,
    damagePotions,
    speedPotions,
    arrowRainCards,
    fireballCards,
    consumeDamagePotion,
    consumeSpeedPotion,
    consumeArrowRainCard,
    consumeFireballCard,
    addLP,
    addTP,
    addGold,
    updateQuestProgress,
    selectedCharacters,
    selectedEmojis,
    registerBattlePlayed,
  } = useGameStore();
  const botDifficulty = mode === 'bot_medium' ? 'medium' : mode === 'bot_hard' ? 'hard' : 'easy';
  const isBotMode = mode.startsWith('bot');
  const isP2P = mode === 'p2p_host' || mode === 'p2p_client';
  const isHost = mode === 'p2p_host';
  const isClient = mode === 'p2p_client';
  const shouldPauseForExitConfirm = isBotMode;
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [elixir, setElixir] = useState(5);
  const [timeLeft, setTimeLeft] = useState(240);
  const [gameOver, setGameOver] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [battleRewards, setBattleRewards] = useState({ gold: 0, tp: 0, lp: 0 });
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [disconnectBanner, setDisconnectBanner] = useState(false);
  const [playerEmojiBubble, setPlayerEmojiBubble] = useState<string | null>(null);
  const [enemyEmojiBubble, setEnemyEmojiBubble] = useState<string | null>(null);
  const [enemyPlayerName, setEnemyPlayerName] = useState('Rakip Oyuncu');
  const [netSyncNotice, setNetSyncNotice] = useState('');
  const [preMatchCount, setPreMatchCount] = useState(3);
  const [preMatchBanner, setPreMatchBanner] = useState<'count' | 'fight' | null>('count');
  const [localDamageBoostActive, setLocalDamageBoostActive] = useState(false);
  const [localSpeedBoostActive, setLocalSpeedBoostActive] = useState(false);
  const [selectedManualAbility, setSelectedManualAbility] = useState<ManualAbilityKind | null>(null);
  const [airshipFeedback, setAirshipFeedback] = useState<AirshipFeedback | null>(null);
  const [playerAirshipCharge, setPlayerAirshipCharge] = useState<Record<AirshipAbilityKind, number>>({
    lockdown: 0,
    boost: 0,
    heal: 0,
    reflector: 0,
    shield: 0,
  });

  const emojiTimeoutsRef = useRef<{ player?: number; enemy?: number }>({});
  const botReplyTimeoutRef = useRef<number | null>(null);
  const disconnectTimeoutRef = useRef<number | null>(null);
  const localForfeitRef = useRef(false);
  const impactFxRef = useRef<ImpactFx[]>([]);
  const lastSnapshotTsRef = useRef(0);
  const lastSnapshotSeqRef = useRef(0);
  const lastSnapshotAtRef = useRef(0);
  const lastPingSentAtRef = useRef(0);
  const lastPingIdRef = useRef(0);
  const pingSentMapRef = useRef<Record<number, number>>({});
  const latencyMsRef = useRef(0);
  const isExitConfirmOpenRef = useRef(false);
  const isBattleLiveRef = useRef(false);
  const stuckTrackRef = useRef<Record<string, { x: number; y: number; stuckSec: number }>>({});
  const uiTimeLeftRef = useRef(240);
  const uiElixirRef = useRef(5);
  const lastResyncReplyAtRef = useRef(0);
  const lastChecksumSentAtRef = useRef(0);
  const desyncStrikeRef = useRef(0);
  const netSyncNoticeTimeoutRef = useRef<number | null>(null);
  const pendingClientSpawnRef = useRef<Record<string, {
    charId: string;
    cost: number;
    level: number;
    x: number;
    y: number;
    sentAt: number;
    lastSentAt: number;
    retries: number;
    optimisticUnitId?: string;
  }>>({});
  const processedSpawnRequestIdsRef = useRef<Set<string>>(new Set());
  const snapshotBufferRef = useRef<Array<{ recvAt: number; data: any }>>([]);
  const pendingAbilitiesRef = useRef<PendingAbility[]>([]);
  const airshipFeedbackRef = useRef<AirshipFeedback | null>(null);
  const airshipChargeRef = useRef<AirshipChargeState>({
    player: { lockdown: 0, boost: 0, heal: 0, reflector: 0, shield: 0 },
    enemy: { lockdown: 0, boost: 0, heal: 0, reflector: 0, shield: 0 },
  });
  const airshipBoostUntilRef = useRef<Record<Team, number>>({ player: 0, enemy: 0 });
  const airshipBoostMultiplierRef = useRef<Record<Team, number>>({ player: 1, enemy: 1 });
  const airshipReflectUntilRef = useRef<Record<Team, number>>({ player: 0, enemy: 0 });
  const potionBuffRef = useRef<{ player: { damage: boolean; speed: boolean }; enemy: { damage: boolean; speed: boolean } }>({
    player: { damage: false, speed: false },
    enemy: { damage: false, speed: false },
  });
  const botPotionUntilRef = useRef<{ damage: number; speed: number }>({ damage: 0, speed: 0 });
  const botPotionDecisionAtRef = useRef(0);
  const botAirshipDecisionAtRef = useRef(0);
  const teamAirshipConfigRef = useRef<Record<Team, { selected: AirshipAbilityKind | null; levels: Record<AirshipAbilityKind, number> }>>({
    player: {
      selected: null,
      levels: { lockdown: 1, boost: 1, heal: 1, reflector: 1, shield: 1 },
    },
    enemy: {
      selected: null,
      levels: { lockdown: 1, boost: 1, heal: 1, reflector: 1, shield: 1 },
    },
  });

  const selectedAirshipId =
    selectedAirship && ownedAirships.includes(selectedAirship as AirshipAbilityKind)
      ? (selectedAirship as AirshipAbilityKind)
      : null;
  const hasSelectedAirship = selectedAirshipId !== null;

  const normalizeAirshipLevels = (input: Partial<Record<AirshipAbilityKind, number>> | null | undefined) => ({
    lockdown: Math.max(1, Math.min(8, Math.floor(input?.lockdown ?? 1))),
    boost: Math.max(1, Math.min(8, Math.floor(input?.boost ?? 1))),
    heal: Math.max(1, Math.min(8, Math.floor(input?.heal ?? 1))),
    reflector: Math.max(1, Math.min(8, Math.floor(input?.reflector ?? 1))),
    shield: Math.max(1, Math.min(8, Math.floor(input?.shield ?? 1))),
  });

  const getAirshipLevel = (team: Team, kind: AirshipAbilityKind) => {
    return teamAirshipConfigRef.current[team].levels[kind] ?? 1;
  };

  const getLockdownDurationMs = (level: number) => Math.min(10000, 4400 + (Math.max(1, level) - 1) * 800);
  const getBoostDurationMs = (level: number) => Math.min(10000, 4400 + (Math.max(1, level) - 1) * 800);
  const getBoostMultiplier = (level: number) => {
    const legacy = 1.3 + ((Math.max(1, level) - 1) / 7) * 0.7;
    return Number((1 + (legacy - 1) * 2).toFixed(2));
  };
  const getHealRatio = (level: number) => Math.min(1, 0.65 + ((Math.max(1, level) - 1) / 7) * 0.35);
  const AIRSHIP_HEAL_DURATION_MS = 7000;
  const getReflectDurationMs = (level: number) => Math.min(10000, 4000 + (Math.max(1, level) - 1) * 860);
  const getShieldHp = (level: number) => {
    const safe = Math.max(1, Math.min(8, Math.floor(level)));
    // Absolute shield HP instead of percentage. Max level caps at 5000 HP.
    return Math.round(1500 + ((safe - 1) / 7) * 3500);
  };

  const applyDamageToEntity = (target: Entity, amount: number) => {
    let remaining = Math.max(0, amount);
    const shield = Math.max(0, target.shieldHp ?? 0);
    if (shield > 0) {
      const absorbed = Math.min(shield, remaining);
      target.shieldHp = shield - absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      target.hp -= remaining;
    }
  };

  const showNetSyncNotice = (message: string, durationMs = 1400) => {
    setNetSyncNotice(message);
    if (netSyncNoticeTimeoutRef.current) {
      window.clearTimeout(netSyncNoticeTimeoutRef.current);
    }
    netSyncNoticeTimeoutRef.current = window.setTimeout(() => {
      setNetSyncNotice('');
      netSyncNoticeTimeoutRef.current = null;
    }, durationMs);
  };

  const computeNetChecksum = () => {
    let hash = 2166136261 >>> 0;
    const entities = stateRef.current.entities
      .filter((entity) => entity.type !== 'projectile')
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const entity of entities) {
      let idHash = 0;
      for (let i = 0; i < entity.id.length; i++) {
        idHash = (idHash * 31 + entity.id.charCodeAt(i)) >>> 0;
      }
      const hpBucket = Math.max(0, Math.round(entity.hp / 20));
      const maxHpBucket = Math.max(1, Math.round(entity.maxHp / 20));
      const alive = entity.hp > 0 ? 1 : 0;
      const typeCode = entity.type === 'tower' ? 7 : 3;

      hash ^= (idHash + hpBucket * 13 + maxHpBucket * 17 + alive * 19 + typeCode) >>> 0;
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    const timeBucket = Math.max(0, Math.round(stateRef.current.timeLeft));
    hash ^= timeBucket;
    hash = Math.imul(hash, 16777619) >>> 0;
    return hash >>> 0;
  };

  useEffect(() => {
    isExitConfirmOpenRef.current = isExitConfirmOpen;
  }, [isExitConfirmOpen]);

  useEffect(() => {
    isBattleLiveRef.current = false;
    setPreMatchCount(3);
    setPreMatchBanner('count');

    const ticks: number[] = [];
    ticks.push(
      window.setTimeout(() => setPreMatchCount(2), 1000),
      window.setTimeout(() => setPreMatchCount(1), 2000),
      window.setTimeout(() => setPreMatchBanner('fight'), 3000),
      window.setTimeout(() => {
        setPreMatchBanner(null);
        isBattleLiveRef.current = true;
      }, 3800),
    );

    return () => {
      ticks.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const stateRef = useRef({
    entities: [] as Entity[],
    elixir: 5,
    enemyElixir: 5,
    lastTime: performance.now(),
    timeLeft: 240,
    gameOver: false,
    stats: { enemiesKilled: 0, towersDestroyed: 0 },
    productionPulseAt: { player: 0, enemy: 0 },
    lastBotSpawnAt: 0,
    lastSyncSentAt: 0,
    lastSyncSeq: 0,
    peerConn: peerConnection
  });

  const currentLeagueIndex = LEAGUES.findIndex((l, i) => lp >= l.minLp && (i === LEAGUES.length - 1 || lp < LEAGUES[i+1].minLp));
  const botLeagueTowerLevel = Math.min(8, Math.max(1, currentLeagueIndex + 1));
  const BOT_CONFIG = {
    easy: {
      minLevel: 1,
      maxLevel: 2,
      rewardMult: 1,
      lpWin: 3,
      lpLose: -2,
      elixirRegenPerSec: 0.5,
      minSpawnGapMs: 2200,
      spawnChance: 0.5,
      minElixirToSpawn: 2,
      highLevelBias: 0.02,
      tactical: false,
    },
    medium: {
      minLevel: 1,
      maxLevel: 5,
      rewardMult: 2,
      lpWin: 5,
      lpLose: -4,
      elixirRegenPerSec: 0.7,
      minSpawnGapMs: 1450,
      spawnChance: 0.72,
      minElixirToSpawn: 3,
      highLevelBias: 0.22,
      tactical: false,
    },
    hard: {
      minLevel: 1,
      maxLevel: 8,
      rewardMult: 3,
      lpWin: 8,
      lpLose: -6,
      elixirRegenPerSec: 0.85,
      minSpawnGapMs: 1080,
      spawnChance: 0.82,
      minElixirToSpawn: 3,
      highLevelBias: 0.35,
      tactical: true,
    },
  } as const;
  const activeBotConfig = BOT_CONFIG[botDifficulty];
  const ELIXIR_REGEN_PER_SEC = 0.5;
  const getCharDef = (charId: string) => INITIAL_CHARACTERS.find(c => c.id === charId);
  const getPlayerLevel = (charId: string) => playerCharacters.find(c => c.id === charId)?.level ?? 1;
  const emojiDeck = selectedEmojis.length > 0 ? selectedEmojis : EMOJI_COLLECTION.slice(0, 6);
  const getBotLevelForLeague = () => {
    const minLevel = activeBotConfig.minLevel;
    const maxLevel = activeBotConfig.maxLevel;
    const levels = Array.from({ length: maxLevel - minLevel + 1 }, (_, idx) => minLevel + idx);
    const weighted = levels.map((level) => {
      const relative = (level - minLevel + 1) / Math.max(1, maxLevel - minLevel + 1);
      return { level, weight: 1 + relative * activeBotConfig.highLevelBias * 10 };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.level;
    }
    return maxLevel;
  };

  const clampLevel = (value: number) => Math.min(8, Math.max(1, Math.floor(value)));
  const getTowerStatsByLevel = (level: number, isMainTower: boolean) => {
    const safeLevel = clampLevel(level);
    const baseHp = isMainTower ? 2500 : 1500;
    const baseDamage = isMainTower ? 70 : 50;
    return {
      level: safeLevel,
      hp: Math.floor(baseHp * Math.pow(isMainTower ? 1.2 : 1.18, safeLevel - 1)),
      damage: Math.floor(baseDamage * Math.pow(1.12, safeLevel - 1)),
    };
  };

  const getDamageMultiplierForTeam = (team: Team) =>
    (potionBuffRef.current[team].damage ? 1.5 : 1) * (airshipBoostUntilRef.current[team] > performance.now() ? airshipBoostMultiplierRef.current[team] : 1);

  const getSpeedMultiplierForTeam = (team: Team) =>
    (potionBuffRef.current[team].speed ? 1.5 : 1) * (airshipBoostUntilRef.current[team] > performance.now() ? airshipBoostMultiplierRef.current[team] : 1);

  const syncPlayerAirshipCharge = () => {
    setPlayerAirshipCharge({ ...airshipChargeRef.current.player });
  };

  const syncUiElixir = (rawElixir: number) => {
    const nextUiElixir = Math.floor(rawElixir);
    if (nextUiElixir === uiElixirRef.current) return;
    uiElixirRef.current = nextUiElixir;
    setElixir(nextUiElixir);
  };

  const syncUiTimeLeft = (nextTimeLeft: number) => {
    if (nextTimeLeft === uiTimeLeftRef.current) return;
    uiTimeLeftRef.current = nextTimeLeft;
    setTimeLeft(nextTimeLeft);
  };

  const showAirshipFeedback = (team: Team, kind: AirshipAbilityKind, nowMs: number) => {
    const nextFeedback: AirshipFeedback = { team, kind, until: nowMs + 1700 };
    airshipFeedbackRef.current = nextFeedback;
    setAirshipFeedback(nextFeedback);
  };

  const addAirshipCharge = (team: Team, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const store = airshipChargeRef.current[team];
    store.lockdown = Math.min(100, store.lockdown + amount);
    store.boost = Math.min(100, store.boost + amount);
    store.heal = Math.min(100, store.heal + amount);
    store.reflector = Math.min(100, store.reflector + amount);
    store.shield = Math.min(100, store.shield + amount);
    if (team === 'player') {
      syncPlayerAirshipCharge();
    }
  };

  const consumeAirshipCharge = (team: Team, kind: AirshipAbilityKind) => {
    const store = airshipChargeRef.current[team];
    if ((store[kind] ?? 0) < 100) return false;
    store[kind] = 0;
    if (team === 'player') {
      syncPlayerAirshipCharge();
    }
    return true;
  };

  const applyAirshipAbility = (team: Team, kind: AirshipAbilityKind, nowMs: number) => {
    const entities = stateRef.current.entities;
    const level = getAirshipLevel(team, kind);
    showAirshipFeedback(team, kind, nowMs);
    if (kind === 'lockdown') {
      const freezeDuration = getLockdownDurationMs(level);
      const enemyTeam: Team = team === 'player' ? 'enemy' : 'player';
      entities.forEach((entity) => {
        if (entity.type !== 'unit' || entity.team !== enemyTeam || entity.hp <= 0) return;
        entity.slowUntil = Math.max(entity.slowUntil ?? 0, nowMs + freezeDuration);
        entity.slowFactor = 0;
        entity.freezeMarkMs = Math.max(entity.freezeMarkMs ?? 0, freezeDuration);
      });
      return;
    }

    if (kind === 'boost') {
      airshipBoostUntilRef.current[team] = nowMs + getBoostDurationMs(level);
      airshipBoostMultiplierRef.current[team] = getBoostMultiplier(level);
      return;
    }

    if (kind === 'reflector') {
      airshipReflectUntilRef.current[team] = nowMs + getReflectDurationMs(level);
      return;
    }

    if (kind === 'shield') {
      const shieldAmount = getShieldHp(level);
      entities.forEach((entity) => {
        if (entity.type !== 'unit' || entity.team !== team || entity.hp <= 0) return;
        entity.shieldMaxHp = shieldAmount;
        entity.shieldHp = Math.max(entity.shieldHp ?? 0, shieldAmount);
      });
      return;
    }

    const healRatio = getHealRatio(level);
    entities.forEach((entity) => {
      if (entity.type !== 'unit' || entity.team !== team || entity.hp <= 0) return;
      const targetHp = Math.min(entity.maxHp, entity.hp + entity.maxHp * healRatio);
      const totalHeal = Math.max(0, targetHp - entity.hp);
      if (totalHeal <= 0) return;
      entity.airshipHealRemainingMs = AIRSHIP_HEAL_DURATION_MS;
      entity.airshipHealPerSecond = totalHeal / (AIRSHIP_HEAL_DURATION_MS / 1000);
    });
  };

  const activateAirshipAbility = (kind: AirshipAbilityKind) => {
    if (!isBattleLiveRef.current || stateRef.current.gameOver || isExitConfirmOpenRef.current) return;
    if (!hasSelectedAirship) return;
    if (!ownedAirships.includes(kind)) return;

    const now = performance.now();

    if (isClient && stateRef.current.peerConn) {
      if (!consumeAirshipCharge('player', kind)) return;
      stateRef.current.peerConn.send({ type: 'airship_request', kind, ts: Date.now() });
      return;
    }

    if (!consumeAirshipCharge('player', kind)) return;
    applyAirshipAbility('player', kind, now);
    if (isHost) {
      pushSyncSnapshot(Date.now(), true);
    }
  };

  const getSlowMultiplier = (entity: Entity, nowMs: number) => {
    if (!entity.slowUntil || entity.slowUntil <= nowMs) return 1;
    return Math.max(0, Math.min(1, entity.slowFactor ?? 0.65));
  };

  const getTowerCombatProfile = (baseDamage: number, type: MainTowerTypeId) => {
    if (type === 'freeze') {
      return { damage: Math.floor(baseDamage * 0.72), attackSpeed: 0.95, range: 155 };
    }
    if (type === 'flame') {
      return { damage: Math.floor(baseDamage * 0.72), attackSpeed: 1.45, range: 165 };
    }
    if (type === 'production') {
      return { damage: Math.floor(baseDamage * 0.25), attackSpeed: 0.7, range: 145 };
    }
    return { damage: baseDamage, attackSpeed: 1, range: 150 };
  };

  const syncTowerCombatStats = (tower: Entity) => {
    if (tower.type !== 'tower') return;
    const towerType = tower.mainTowerType ?? 'arrow';
    const base = getTowerStatsByLevel(tower.level ?? 1, !!tower.isMainTower);
    const profile = getTowerCombatProfile(base.damage, towerType);
    tower.damage = profile.damage;
    tower.attackSpeed = profile.attackSpeed;
    tower.range = profile.range;
  };

  const getBotMainTowerType = (): MainTowerTypeId => {
    if (botLeagueTowerLevel >= 7) return 'production';
    if (botLeagueTowerLevel >= 5) return 'flame';
    if (botLeagueTowerLevel >= 3) return 'freeze';
    return 'arrow';
  };

  const activatePotion = (kind: 'damage' | 'speed') => {
    if (!isBattleLiveRef.current || stateRef.current.gameOver || isExitConfirmOpenRef.current) return;

    if (kind === 'damage') {
      if (localDamageBoostActive) return;
      const result = consumeDamagePotion();
      if (!result.ok) return;
      setLocalDamageBoostActive(true);
      // Apply local visual state immediately; host keeps authoritative combat values.
      potionBuffRef.current.player.damage = true;
      if (isClient && stateRef.current.peerConn) {
        stateRef.current.peerConn.send({ type: 'potion_use', kind: 'damage' });
      }
      return;
    }

    if (localSpeedBoostActive) return;
    const result = consumeSpeedPotion();
    if (!result.ok) return;
    setLocalSpeedBoostActive(true);
    // Apply local visual state immediately; host keeps authoritative combat values.
    potionBuffRef.current.player.speed = true;
    if (isClient && stateRef.current.peerConn) {
      stateRef.current.peerConn.send({ type: 'potion_use', kind: 'speed' });
    }
  };

  const activateManualAbility = (kind: ManualAbilityKind) => {
    if (!isBattleLiveRef.current || stateRef.current.gameOver || isExitConfirmOpenRef.current) return;

    if (kind === 'arrow_rain' && arrowRainCards <= 0) return;
    if (kind === 'fireball' && fireballCards <= 0) return;

    setSelectedManualAbility((current) => (current === kind ? null : kind));
    setSelectedCard(null);
  };

  const queueManualAbility = (kind: ManualAbilityKind, team: Team, x: number, y: number) => {
    const safeX = Math.max(18, Math.min(CANVAS_W - 18, x));
    const safeY = Math.max(18, Math.min(CANVAS_H - 18, y));
    const ability: PendingAbility = {
      id: `ab_${Math.random().toString(36).slice(2, 10)}`,
      kind,
      team,
      x: safeX,
      y: safeY,
      landsAt: performance.now() + MANUAL_ABILITY_DELAY_MS,
    };
    pendingAbilitiesRef.current.push(ability);
    return ability.id;
  };

  const applyManualAbility = (ability: PendingAbility, nowMs: number) => {
    const entities = stateRef.current.entities;
    const enemyTeam = ability.team === 'player' ? 'enemy' : 'player';
    const radius = ability.kind === 'fireball' ? 82 : 66;
    const baseDamage = ability.kind === 'fireball' ? 620 : 360;

    entities.forEach((entity) => {
      if (entity.team !== enemyTeam || entity.hp <= 0 || entity.type === 'projectile') return;
      const d = Math.hypot(entity.x - ability.x, entity.y - ability.y);
      if (d > radius + entity.radius) return;
      const falloff = ability.kind === 'fireball' ? Math.max(0.65, 1 - d / (radius * 1.3)) : Math.max(0.72, 1 - d / (radius * 1.45));
      const damage = baseDamage * falloff;
      applyDamageToEntity(entity, damage);

      if (ability.kind === 'fireball' && entity.type === 'unit') {
        const burnDuration = 4200;
        const burnDps = 120;
        entity.burnRemainingMs = Math.max(entity.burnRemainingMs ?? 0, burnDuration);
        entity.burnDps = Math.max(entity.burnDps ?? 0, burnDps);
      }

      if (entity.hp <= 0) {
        if (entity.type === 'unit' && enemyTeam === 'enemy') stateRef.current.stats.enemiesKilled += 1;
        if (entity.type === 'tower' && enemyTeam === 'enemy') stateRef.current.stats.towersDestroyed += 1;
        addAirshipCharge(ability.team, entity.type === 'tower' ? 16 : 5);
        if (entity.isMainTower) {
          endGame(enemyTeam === 'enemy' ? 'win' : 'lose');
        }
      }
    });

    pushManualAbilityImpactFx(ability);

    playHitSfx(ability.kind === 'fireball' ? 'fireball' : 'arrowrain');

    if (isHost) {
      pushSyncSnapshot(nowMs, true);
    }
  };

  const pushManualAbilityImpactFx = (ability: PendingAbility) => {
    impactFxRef.current.push({
      x: ability.x,
      y: ability.y,
      radius: 5,
      maxRadius: ability.kind === 'fireball' ? 66 : 58,
      life: 0.45,
      maxLife: 0.45,
      color: ability.kind === 'fireball' ? '#fb923c' : '#f59e0b',
    });

    // Small secondary ring to make manual skills visually clear on impact.
    impactFxRef.current.push({
      x: ability.x,
      y: ability.y,
      radius: 2,
      maxRadius: ability.kind === 'fireball' ? 48 : 42,
      life: 0.32,
      maxLife: 0.32,
      color: ability.kind === 'fireball' ? '#f97316' : '#fde047',
    });
  };

  const getPlayerTowerLevels = () => ({
    side: clampLevel(towerLevels?.side ?? 1),
    main: clampLevel(towerLevels?.main ?? 1),
  });

  const getBotTowerLevels = () => ({ side: botLeagueTowerLevel, main: botLeagueTowerLevel });

  const applyEnemyTowerLevels = (levels: { side: number; main: number }) => {
    const safeLevels = {
      side: clampLevel(levels.side),
      main: clampLevel(levels.main),
    };
    stateRef.current.entities = stateRef.current.entities.map((entity) => {
      if (entity.type !== 'tower' || entity.team !== 'enemy') return entity;
      const stats = getTowerStatsByLevel(safeLevels[entity.isMainTower ? 'main' : 'side'], !!entity.isMainTower);
      const towerType = entity.mainTowerType ?? 'arrow';
      const profile = getTowerCombatProfile(stats.damage, towerType);
      const hpRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 1;
      return {
        ...entity,
        level: stats.level,
        maxHp: stats.hp,
        hp: Math.max(1, Math.floor(stats.hp * Math.max(0, Math.min(1, hpRatio)))),
        damage: profile.damage,
        attackSpeed: profile.attackSpeed,
        range: profile.range,
      };
    });
  };

  const applyEnemyMainTowerType = (typeId: MainTowerTypeId) => {
    stateRef.current.entities = stateRef.current.entities.map((entity) => {
      if (entity.type !== 'tower' || entity.team !== 'enemy') return entity;
      const baseStats = getTowerStatsByLevel(entity.level ?? 1, !!entity.isMainTower);
      const profile = getTowerCombatProfile(baseStats.damage, typeId);
      return {
        ...entity,
        mainTowerType: typeId,
        damage: profile.damage,
        attackSpeed: profile.attackSpeed,
        range: profile.range,
      };
    });
  };

  const showEmojiBubble = (team: Team, emoji: string) => {
    const sideKey = team === 'player' ? 'player' : 'enemy';
    if (emojiTimeoutsRef.current[sideKey]) {
      window.clearTimeout(emojiTimeoutsRef.current[sideKey]);
    }

    if (team === 'player') {
      setPlayerEmojiBubble(emoji);
    } else {
      setEnemyEmojiBubble(emoji);
    }

    emojiTimeoutsRef.current[sideKey] = window.setTimeout(() => {
      if (team === 'player') {
        setPlayerEmojiBubble(null);
      } else {
        setEnemyEmojiBubble(null);
      }
    }, 1800);
  };

  const sendEmoji = (emoji: string) => {
    if (stateRef.current.gameOver || isExitConfirmOpenRef.current) return;
    showEmojiBubble('player', emoji);

    if (isBotMode) {
      if (botReplyTimeoutRef.current) {
        window.clearTimeout(botReplyTimeoutRef.current);
      }

      // Bot quickly responds to player emotes to keep battles lively.
      botReplyTimeoutRef.current = window.setTimeout(() => {
        if (stateRef.current.gameOver) return;
        const randomEmoji = EMOJI_COLLECTION[Math.floor(Math.random() * EMOJI_COLLECTION.length)];
        showEmojiBubble('enemy', randomEmoji);
      }, 700 + Math.floor(Math.random() * 900));
    }

    if (mode !== 'bot' && stateRef.current.peerConn) {
      stateRef.current.peerConn.send({ type: 'emoji', emoji });
    }
  };

  const applyAuthoritativeResult = (result: 'win' | 'lose' | 'draw', rewards: { gold: number; tp: number; lp: number }) => {
    if (stateRef.current.gameOver) return;
    stateRef.current.gameOver = true;
    setGameOver(result);
    setBattleRewards(rewards);
    registerBattlePlayed();
    addGold(rewards.gold);
    addTP(rewards.tp);
    if (rewards.lp !== 0) {
      addLP(rewards.lp);
    }
  };

  const triggerDisconnectWin = () => {
    if (stateRef.current.gameOver) return;
    stateRef.current.gameOver = true;
    setDisconnectBanner(true);

    if (disconnectTimeoutRef.current) {
      window.clearTimeout(disconnectTimeoutRef.current);
    }

    disconnectTimeoutRef.current = window.setTimeout(() => {
      setDisconnectBanner(false);
      endGame('win', true, 'disconnect');
    }, 1600);
  };

  const pushSyncSnapshot = (timeStampMs: number, force = false) => {
    if (!isHost || !stateRef.current.peerConn) return;
    if (!stateRef.current.peerConn.open) return;

    // Adaptive sync pacing reduces host-side stutter when board gets crowded.
    const liveEntityCount = stateRef.current.entities.length;
    const minSyncGap = liveEntityCount > 60 ? 160 : liveEntityCount > 35 ? 130 : 100;
    if (!force && timeStampMs - stateRef.current.lastSyncSentAt < minSyncGap) return;
    stateRef.current.lastSyncSentAt = timeStampMs;
    stateRef.current.lastSyncSeq += 1;

    // Keep snapshots compact: cap projectile count to avoid client-side frame drops.
    const towersAndUnits = stateRef.current.entities.filter((entity) => entity.type !== 'projectile');
    const projectiles = stateRef.current.entities
      .filter((entity) => entity.type === 'projectile')
      .slice(-24);
    const snapshotEntities = [...towersAndUnits, ...projectiles];

    const payload = {
      type: 'sync_snapshot',
      ts: timeStampMs,
      seq: stateRef.current.lastSyncSeq,
      timeLeft: stateRef.current.timeLeft,
      hostElixir: stateRef.current.elixir,
      enemyElixir: stateRef.current.enemyElixir,
      potionBuffs: potionBuffRef.current,
      airshipCharges: airshipChargeRef.current,
      airshipBoostUntil: airshipBoostUntilRef.current,
      airshipReflectUntil: airshipReflectUntilRef.current,
      airshipFeedback:
        airshipFeedbackRef.current && airshipFeedbackRef.current.until > performance.now()
          ? airshipFeedbackRef.current
          : null,
      abilities: pendingAbilitiesRef.current.map((ability): SnapshotAbility => ({
        id: ability.id,
        kind: ability.kind,
        team: ability.team,
        x: Math.round(ability.x * 10) / 10,
        y: Math.round(ability.y * 10) / 10,
        landsAt: ability.landsAt,
      })),
      entities: snapshotEntities.map(toSnapshotEntity),
    };
    stateRef.current.peerConn.send(payload);
  };

  const reconcileClientEntities = (incoming: Entity[]) => {
    const previous = stateRef.current.entities;
    const prevMap = new Map(previous.map((entity) => [entity.id, entity]));
    const interpolation = latencyMsRef.current > 120 ? 0.48 : 0.62;
    const hpInterpolation = latencyMsRef.current > 120 ? 0.68 : 0.78;

    return incoming.map((nextEntity) => {
      const prev = prevMap.get(nextEntity.id);
      if (!prev) return nextEntity;

      if (nextEntity.type === 'projectile') {
        return nextEntity;
      }

      return {
        ...nextEntity,
        // Light interpolation hides packet jitter on LAN and keeps movement smooth.
        x: prev.x + (nextEntity.x - prev.x) * interpolation,
        y: prev.y + (nextEntity.y - prev.y) * interpolation,
        hp: prev.hp + (nextEntity.hp - prev.hp) * hpInterpolation,
      };
    });
  };

  const applySnapshotNow = (data: any) => {
    if (data.potionBuffs && typeof data.potionBuffs === 'object') {
      const hostBuffs = data.potionBuffs as {
        player?: { damage?: boolean; speed?: boolean };
        enemy?: { damage?: boolean; speed?: boolean };
      };
      // Snapshot is in host orientation; mirror team buffs for client view.
      potionBuffRef.current = {
        player: {
          damage: !!hostBuffs.enemy?.damage,
          speed: !!hostBuffs.enemy?.speed,
        },
        enemy: {
          damage: !!hostBuffs.player?.damage,
          speed: !!hostBuffs.player?.speed,
        },
      };
      setLocalDamageBoostActive(!!hostBuffs.enemy?.damage);
      setLocalSpeedBoostActive(!!hostBuffs.enemy?.speed);
    }

    if (data.airshipBoostUntil && typeof data.airshipBoostUntil === 'object') {
      const hostBoost = data.airshipBoostUntil as { player?: number; enemy?: number };
      airshipBoostUntilRef.current = {
        player: Number(hostBoost.enemy) || 0,
        enemy: Number(hostBoost.player) || 0,
      };
    }

    if (data.airshipFeedback && typeof data.airshipFeedback === 'object') {
      const hostFeedback = data.airshipFeedback as Partial<AirshipFeedback>;
      if (
        (hostFeedback.team === 'player' || hostFeedback.team === 'enemy') &&
        (hostFeedback.kind === 'lockdown' || hostFeedback.kind === 'boost' || hostFeedback.kind === 'heal' || hostFeedback.kind === 'reflector' || hostFeedback.kind === 'shield') &&
        Number.isFinite(hostFeedback.until)
      ) {
        const mirrored: AirshipFeedback = {
          team: swapTeam(hostFeedback.team),
          kind: hostFeedback.kind,
          until: Number(hostFeedback.until),
        };
        airshipFeedbackRef.current = mirrored;
        setAirshipFeedback(mirrored);
      }
    }

    if (data.airshipCharges && typeof data.airshipCharges === 'object') {
      const hostCharges = data.airshipCharges as AirshipChargeState;
      airshipChargeRef.current = {
        player: {
          lockdown: Math.max(0, Math.min(100, Number(hostCharges.enemy?.lockdown ?? 0))),
          boost: Math.max(0, Math.min(100, Number(hostCharges.enemy?.boost ?? 0))),
          heal: Math.max(0, Math.min(100, Number(hostCharges.enemy?.heal ?? 0))),
          reflector: Math.max(0, Math.min(100, Number(hostCharges.enemy?.reflector ?? 0))),
          shield: Math.max(0, Math.min(100, Number(hostCharges.enemy?.shield ?? 0))),
        },
        enemy: {
          lockdown: Math.max(0, Math.min(100, Number(hostCharges.player?.lockdown ?? 0))),
          boost: Math.max(0, Math.min(100, Number(hostCharges.player?.boost ?? 0))),
          heal: Math.max(0, Math.min(100, Number(hostCharges.player?.heal ?? 0))),
          reflector: Math.max(0, Math.min(100, Number(hostCharges.player?.reflector ?? 0))),
          shield: Math.max(0, Math.min(100, Number(hostCharges.player?.shield ?? 0))),
        },
      };
      syncPlayerAirshipCharge();
    }

    if (data.airshipReflectUntil && typeof data.airshipReflectUntil === 'object') {
      const hostReflect = data.airshipReflectUntil as { player?: number; enemy?: number };
      airshipReflectUntilRef.current = {
        player: Number(hostReflect.enemy) || 0,
        enemy: Number(hostReflect.player) || 0,
      };
    }

    if (Array.isArray(data.abilities)) {
      const mirroredAbilities: PendingAbility[] = data.abilities
        .filter((ability: Partial<SnapshotAbility>) => {
          if (!ability || typeof ability !== 'object') return false;
          if (typeof ability.id !== 'string' || ability.id.length === 0) return false;
          if (ability.kind !== 'arrow_rain' && ability.kind !== 'fireball') return false;
          if (ability.team !== 'player' && ability.team !== 'enemy') return false;
          if (!Number.isFinite(ability.x) || !Number.isFinite(ability.y) || !Number.isFinite(ability.landsAt)) return false;
          return true;
        })
        .map((ability: SnapshotAbility) => ({
          id: ability.id,
          kind: ability.kind,
          team: swapTeam(ability.team),
          x: CANVAS_W - ability.x,
          y: CANVAS_H - ability.y,
          landsAt: ability.landsAt,
        }));
      pendingAbilitiesRef.current = mirroredAbilities;
    }

    lastSnapshotTsRef.current = data.ts;
    lastSnapshotAtRef.current = performance.now();
    stateRef.current.timeLeft = typeof data.timeLeft === 'number' ? data.timeLeft : stateRef.current.timeLeft;
    syncUiTimeLeft(stateRef.current.timeLeft);

    if (typeof data.enemyElixir === 'number') {
      stateRef.current.elixir = data.enemyElixir;
      syncUiElixir(stateRef.current.elixir);
    }

    // Drop malformed entities from remote snapshots to avoid NaN draw/update crashes.
    const sanitizedEntities = data.entities.filter((entity: Partial<Entity>) => {
      if (!entity || typeof entity !== 'object') return false;
      if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return false;
      if (!Number.isFinite(entity.hp) || !Number.isFinite(entity.maxHp)) return false;
      if (!Number.isFinite(entity.radius)) return false;
      if (!entity.id || typeof entity.id !== 'string') return false;
      return entity.type === 'unit' || entity.type === 'tower' || entity.type === 'projectile';
    }).map((entity: Partial<Entity>) => ({
      id: entity.id as string,
      type: entity.type as Entity['type'],
      team: (entity.team as Team) ?? 'enemy',
      x: Number(entity.x),
      y: Number(entity.y),
      hp: Number(entity.hp),
      maxHp: Number(entity.maxHp),
      radius: Number(entity.radius),
      name: entity.name,
      level: entity.level,
      color: entity.color,
      isMainTower: entity.isMainTower,
      projectileColor: entity.projectileColor,
      fxTier: entity.fxTier,
      mainTowerType: entity.mainTowerType as MainTowerTypeId | undefined,
      burnRemainingMs: Number.isFinite(entity.burnRemainingMs) ? Number(entity.burnRemainingMs) : 0,
      freezeMarkMs: Number.isFinite(entity.freezeMarkMs) ? Number(entity.freezeMarkMs) : 0,
      towerFlameMarkMs: Number.isFinite(entity.towerFlameMarkMs) ? Number(entity.towerFlameMarkMs) : 0,
      shieldHp: Number.isFinite(entity.shieldHp) ? Math.max(0, Number(entity.shieldHp)) : 0,
      shieldMaxHp: Number.isFinite(entity.shieldMaxHp) ? Math.max(0, Number(entity.shieldMaxHp)) : 0,
    }));

    const mirroredEntities = sanitizedEntities.map((entity: Entity) => mirrorForEnemyView(entity));
    stateRef.current.entities = reconcileClientEntities(mirroredEntities);
  };

  const queueSnapshot = (data: any) => {
    if (!isClient) return;
    if (typeof data.seq === 'number') {
      if (data.seq <= lastSnapshotSeqRef.current) return;
      lastSnapshotSeqRef.current = data.seq;
    }
    if (typeof data.ts !== 'number' || data.ts <= lastSnapshotTsRef.current) return;
    if (!Array.isArray(data.entities)) return;

    snapshotBufferRef.current.push({ recvAt: performance.now(), data });
    if (snapshotBufferRef.current.length > 10) {
      snapshotBufferRef.current.shift();
    }
  };

  const flushSnapshotBuffer = () => {
    if (!isClient || snapshotBufferRef.current.length === 0) return;
    const renderDelay = latencyMsRef.current > 0
      ? Math.max(60, Math.min(180, latencyMsRef.current * 0.8))
      : 90;
    const now = performance.now();
    let chosenIndex = -1;

    for (let i = 0; i < snapshotBufferRef.current.length; i++) {
      if (now - snapshotBufferRef.current[i].recvAt >= renderDelay) {
        chosenIndex = i;
      }
    }

    if (chosenIndex < 0) {
      const oldest = snapshotBufferRef.current[0];
      if (oldest && now - oldest.recvAt > 220) {
        chosenIndex = 0;
      }
    }

    if (chosenIndex < 0) return;
    const packet = snapshotBufferRef.current[chosenIndex];
    snapshotBufferRef.current = snapshotBufferRef.current.slice(chosenIndex + 1);
    applySnapshotNow(packet.data);
  };

  useEffect(() => {
    lastSnapshotAtRef.current = performance.now();
    const playerTower = getPlayerTowerLevels();
    const initialEnemyLevels = isBotMode ? getBotTowerLevels() : { side: 1, main: 1 };
    const playerMainTowerType: MainTowerTypeId = selectedMainTowerType;
    const enemyMainTowerType: MainTowerTypeId = isBotMode ? getBotMainTowerType() : 'arrow';
    const pSideStats = getTowerStatsByLevel(playerTower.side, false);
    const pMainStats = getTowerStatsByLevel(playerTower.main, true);
    const pSideCombat = getTowerCombatProfile(pSideStats.damage, playerMainTowerType);
    const pMainCombat = getTowerCombatProfile(pMainStats.damage, playerMainTowerType);
    const eSideStats = getTowerStatsByLevel(initialEnemyLevels.side, false);
    const eMainStats = getTowerStatsByLevel(initialEnemyLevels.main, true);
    const eSideCombat = getTowerCombatProfile(eSideStats.damage, enemyMainTowerType);
    const eMainCombat = getTowerCombatProfile(eMainStats.damage, enemyMainTowerType);

    const initTowers: Entity[] = [
      { id: 'pt1', type: 'tower', team: 'player', x: 100, y: 500, hp: pSideStats.hp, maxHp: pSideStats.hp, radius: 25, attackSpeed: pSideCombat.attackSpeed, lastAttack: 0, damage: pSideCombat.damage, range: pSideCombat.range, level: pSideStats.level, mainTowerType: playerMainTowerType },
      { id: 'pt2', type: 'tower', team: 'player', x: 300, y: 500, hp: pSideStats.hp, maxHp: pSideStats.hp, radius: 25, attackSpeed: pSideCombat.attackSpeed, lastAttack: 0, damage: pSideCombat.damage, range: pSideCombat.range, level: pSideStats.level, mainTowerType: playerMainTowerType },
      { id: 'pmt', type: 'tower', team: 'player', x: 200, y: 560, hp: pMainStats.hp, maxHp: pMainStats.hp, radius: 35, attackSpeed: pMainCombat.attackSpeed, lastAttack: 0, damage: pMainCombat.damage, range: pMainCombat.range, isMainTower: true, level: pMainStats.level, mainTowerType: playerMainTowerType },
      
      { id: 'et1', type: 'tower', team: 'enemy', x: 100, y: 100, hp: eSideStats.hp, maxHp: eSideStats.hp, radius: 25, attackSpeed: eSideCombat.attackSpeed, lastAttack: 0, damage: eSideCombat.damage, range: eSideCombat.range, level: eSideStats.level, mainTowerType: enemyMainTowerType },
      { id: 'et2', type: 'tower', team: 'enemy', x: 300, y: 100, hp: eSideStats.hp, maxHp: eSideStats.hp, radius: 25, attackSpeed: eSideCombat.attackSpeed, lastAttack: 0, damage: eSideCombat.damage, range: eSideCombat.range, level: eSideStats.level, mainTowerType: enemyMainTowerType },
      { id: 'emt', type: 'tower', team: 'enemy', x: 200, y: 40, hp: eMainStats.hp, maxHp: eMainStats.hp, radius: 35, attackSpeed: eMainCombat.attackSpeed, lastAttack: 0, damage: eMainCombat.damage, range: eMainCombat.range, isMainTower: true, level: eMainStats.level, mainTowerType: enemyMainTowerType },
    ];
    stateRef.current.entities = initTowers;
    pendingAbilitiesRef.current = [];
    potionBuffRef.current = {
      player: { damage: false, speed: false },
      enemy: { damage: false, speed: false },
    };
    airshipChargeRef.current = {
      player: { lockdown: 0, boost: 0, heal: 0, reflector: 0, shield: 0 },
      enemy: { lockdown: 0, boost: 0, heal: 0, reflector: 0, shield: 0 },
    };
    airshipBoostUntilRef.current = { player: 0, enemy: 0 };
    airshipBoostMultiplierRef.current = { player: 1, enemy: 1 };
    airshipReflectUntilRef.current = { player: 0, enemy: 0 };
    airshipFeedbackRef.current = null;
    setAirshipFeedback(null);
    botPotionUntilRef.current = { damage: 0, speed: 0 };
    botPotionDecisionAtRef.current = 0;
    botAirshipDecisionAtRef.current = 0;
    teamAirshipConfigRef.current.player = {
      selected: selectedAirshipId,
      levels: normalizeAirshipLevels(airshipLevels),
    };
    teamAirshipConfigRef.current.enemy = {
      selected:
        isBotMode && botDifficulty === 'hard'
          ? (['lockdown', 'boost', 'heal', 'reflector', 'shield'][Math.floor(Math.random() * 5)] as AirshipAbilityKind)
          : null,
      levels: { lockdown: 1, boost: 1, heal: 1, reflector: 1, shield: 1 },
    };
    syncPlayerAirshipCharge();
    setLocalDamageBoostActive(false);
    setLocalSpeedBoostActive(false);

    if (isP2P && peerConnection) {
      peerConnection.on('data', (data: any) => {
        if (data.type === 'emoji' && typeof data.emoji === 'string') {
          showEmojiBubble('enemy', data.emoji);
        }

        if (data.type === 'forfeit') {
          triggerDisconnectWin();
        }

        if (data.type === 'profile' && typeof data.name === 'string') {
          setEnemyPlayerName(data.name.trim() || 'Rakip Oyuncu');
          if (typeof data.mainTowerType === 'string') {
            const incomingTowerType = data.mainTowerType as MainTowerTypeId;
            if (incomingTowerType === 'arrow' || incomingTowerType === 'freeze' || incomingTowerType === 'flame' || incomingTowerType === 'production') {
              applyEnemyMainTowerType(incomingTowerType);
            }
          }
          if (data.towerLevels && typeof data.towerLevels === 'object') {
            const incoming = data.towerLevels as { side?: number; main?: number };
            applyEnemyTowerLevels({
              side: Number.isFinite(incoming.side) ? Number(incoming.side) : 1,
              main: Number.isFinite(incoming.main) ? Number(incoming.main) : 1,
            });
          }

          const incomingSelected =
            data.airshipSelected === 'lockdown' || data.airshipSelected === 'boost' || data.airshipSelected === 'heal' || data.airshipSelected === 'reflector' || data.airshipSelected === 'shield'
              ? (data.airshipSelected as AirshipAbilityKind)
              : null;
          const incomingLevels = normalizeAirshipLevels(
            data.airshipLevels && typeof data.airshipLevels === 'object'
              ? (data.airshipLevels as Partial<Record<AirshipAbilityKind, number>>)
              : null
          );
          teamAirshipConfigRef.current.enemy = {
            selected: incomingSelected,
            levels: incomingLevels,
          };
        }

        if (data.type === 'ping' && typeof data.id === 'number') {
          if (stateRef.current.peerConn) {
            stateRef.current.peerConn.send({ type: 'pong', id: data.id, ts: data.ts ?? Date.now() });
          }
        }

        if (data.type === 'pong' && typeof data.id === 'number') {
          const sentAt = pingSentMapRef.current[data.id];
          if (typeof sentAt === 'number') {
            const rtt = Date.now() - sentAt;
            latencyMsRef.current = latencyMsRef.current === 0 ? rtt : latencyMsRef.current * 0.7 + rtt * 0.3;
            delete pingSentMapRef.current[data.id];
          }
        }

        if (data.type === 'state_checksum' && typeof data.checksum === 'number') {
          const localChecksum = computeNetChecksum();
          if (localChecksum !== Number(data.checksum)) {
            desyncStrikeRef.current += 1;
            if (desyncStrikeRef.current >= 3) {
              desyncStrikeRef.current = 0;
              showNetSyncNotice('SENKRONIZASYON DÜZELTİLİYOR');
              if (isClient && stateRef.current.peerConn?.open) {
                stateRef.current.peerConn.send({ type: 'resync_request', ts: Date.now(), reason: 'checksum_mismatch' });
              }
              if (isHost) {
                pushSyncSnapshot(Date.now(), true);
              }
            }
          } else {
            desyncStrikeRef.current = 0;
          }
        }

        if (isHost && data.type === 'resync_request') {
          const now = Date.now();
          // Throttle forced resync replies so repeated requests do not stall host updates.
          if (now - lastResyncReplyAtRef.current > 180) {
            lastResyncReplyAtRef.current = now;
            pushSyncSnapshot(now, true);
          }
        }

        if (isHost && data.type === 'spawn_request') {
          const char = getCharDef(data.charId);
          if (!char) return;
          const requestId = typeof data.requestId === 'string' ? data.requestId : null;

          if (requestId && processedSpawnRequestIdsRef.current.has(requestId)) {
            if (stateRef.current.peerConn) {
              stateRef.current.peerConn.send({
                type: 'spawn_ack',
                requestId,
                enemyElixir: stateRef.current.enemyElixir,
              });
            }
            return;
          }

          if (stateRef.current.enemyElixir < char.cost) {
            if (requestId && stateRef.current.peerConn) {
              stateRef.current.peerConn.send({
                type: 'spawn_reject',
                requestId,
                enemyElixir: stateRef.current.enemyElixir,
              });
            }
            return;
          }

          if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;

          // Remote player can only deploy on their own side as well.
          if (typeof data.y !== 'number' || data.y < RIVER_BOTTOM + 2) return;

          // Remote player coordinates are mirrored into host world.
          const mirrored = sanitizeSpawnPosition(CANVAS_W - data.x, CANVAS_H - data.y, 'enemy');

          stateRef.current.enemyElixir -= char.cost;
          const unitLevel = Number.isFinite(data.level) ? data.level : 1;
          spawnUnit(data.charId, 'enemy', mirrored.x, mirrored.y, unitLevel);
          if (requestId) {
            processedSpawnRequestIdsRef.current.add(requestId);
            if (processedSpawnRequestIdsRef.current.size > 300) {
              const first = processedSpawnRequestIdsRef.current.values().next().value;
              if (first) processedSpawnRequestIdsRef.current.delete(first);
            }
          }

          if (requestId && stateRef.current.peerConn) {
            stateRef.current.peerConn.send({
              type: 'spawn_ack',
              requestId,
              enemyElixir: stateRef.current.enemyElixir,
            });
          }
        }

        if (isHost && data.type === 'potion_use') {
          if (data.kind === 'damage') {
            potionBuffRef.current.enemy.damage = true;
          }
          if (data.kind === 'speed') {
            potionBuffRef.current.enemy.speed = true;
          }
          pushSyncSnapshot(Date.now(), true);
        }

        if (isHost && data.type === 'ability_request') {
          const kind = data.kind as ManualAbilityKind;
          if (kind !== 'arrow_rain' && kind !== 'fireball') return;
          if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
          const worldX = CANVAS_W - Number(data.x);
          const worldY = CANVAS_H - Number(data.y);
          queueManualAbility(kind, 'enemy', worldX, worldY);
          pushSyncSnapshot(Date.now(), true);
        }

        if (isHost && data.type === 'airship_request') {
          const kind = data.kind as AirshipAbilityKind;
          if (kind !== 'lockdown' && kind !== 'boost' && kind !== 'heal' && kind !== 'reflector' && kind !== 'shield') return;
          if (!consumeAirshipCharge('enemy', kind)) return;
          applyAirshipAbility('enemy', kind, performance.now());
          pushSyncSnapshot(Date.now(), true);
        }

        if (isClient && data.type === 'sync_snapshot') {
          queueSnapshot(data);
        }

        if (isClient && data.type === 'match_result') {
          const rewards = data.rewards ?? { gold: 0, tp: 0, lp: 0 };
          applyAuthoritativeResult(data.result, rewards);
        }

        if (isClient && data.type === 'spawn_ack' && typeof data.requestId === 'string') {
          delete pendingClientSpawnRef.current[data.requestId];
          if (typeof data.enemyElixir === 'number') {
            stateRef.current.elixir = Math.max(0, Math.min(10, data.enemyElixir));
            syncUiElixir(stateRef.current.elixir);
          }
        }

        if (isClient && data.type === 'spawn_reject' && typeof data.requestId === 'string') {
          const pending = pendingClientSpawnRef.current[data.requestId];
          if (!pending) return;

          // Roll back optimistic spawn and refund elixir if host rejected request.
          stateRef.current.entities = stateRef.current.entities.filter(
            (entity) => !(entity.type === 'unit' && entity.pendingRequestId === data.requestId)
          );

          stateRef.current.elixir = Math.min(10, stateRef.current.elixir + pending.cost);
          if (typeof data.enemyElixir === 'number') {
            stateRef.current.elixir = Math.max(stateRef.current.elixir, Math.min(10, data.enemyElixir));
          }
          syncUiElixir(stateRef.current.elixir);
          delete pendingClientSpawnRef.current[data.requestId];
        }
      });

      peerConnection.on('close', () => {
        if (!localForfeitRef.current) {
          triggerDisconnectWin();
        }
      });
      peerConnection.on('error', () => {
        if (!localForfeitRef.current) {
          triggerDisconnectWin();
        }
      });
      peerConnection.send({
        type: 'profile',
        name: playerName,
        mainTowerType: selectedMainTowerType,
        airshipSelected: selectedAirshipId,
        airshipLevels: normalizeAirshipLevels(airshipLevels),
        towerLevels: {
          side: playerTower.side,
          main: playerTower.main,
        },
      });
    }

    let reqId: number;
    const loop = (time: number) => {
      if (!isClient) {
        if (isBattleLiveRef.current && !(isExitConfirmOpenRef.current && shouldPauseForExitConfirm)) {
          updateGame(time);
          pushSyncSnapshot(Date.now());
        }
      } else {
        flushSnapshotBuffer();
      }
      drawGame();
      if (!stateRef.current.gameOver) {
        reqId = requestAnimationFrame(loop);
      }
    };
    reqId = requestAnimationFrame(loop);

    const elixirTimer = setInterval(() => {
      if (stateRef.current.gameOver) return;
      if (!isBattleLiveRef.current) return;
      if (isExitConfirmOpenRef.current && shouldPauseForExitConfirm) return;

      if (isClient) {
        // Predictive elixir fill for client reduces perceived delay between snapshots.
        stateRef.current.elixir = Math.min(10, stateRef.current.elixir + ELIXIR_REGEN_PER_SEC);
        syncUiElixir(stateRef.current.elixir);
        return;
      }

      stateRef.current.elixir = Math.min(10, stateRef.current.elixir + ELIXIR_REGEN_PER_SEC);
      syncUiElixir(stateRef.current.elixir);
      if (hasSelectedAirship) {
        // Slightly faster ship charge for a more responsive pace.
        addAirshipCharge('player', 2.2);
      }

      if (isBotMode) {
        // Bot elixir now scales by selected difficulty.
        stateRef.current.enemyElixir = Math.min(10, stateRef.current.enemyElixir + activeBotConfig.elixirRegenPerSec);
        if (botDifficulty === 'hard') {
          addAirshipCharge('enemy', 2.2);
          updateBotAirshipSystem();
        }
        updateBotPotionSystem();
        handleBotAI();
      } else if (isHost) {
        // In online matches both players regenerate elixir on host-authoritative timeline.
        stateRef.current.enemyElixir = Math.min(10, stateRef.current.enemyElixir + ELIXIR_REGEN_PER_SEC);
        addAirshipCharge('enemy', 2.2);
      }
    }, 1000);

    const netHealthTimer = setInterval(() => {
      if (!isP2P || !stateRef.current.peerConn || stateRef.current.gameOver) return;

      const now = Date.now();
      if (now - lastPingSentAtRef.current >= 2000) {
        lastPingSentAtRef.current = now;
        lastPingIdRef.current += 1;
        const pingId = lastPingIdRef.current;
        pingSentMapRef.current[pingId] = now;
        stateRef.current.peerConn.send({ type: 'ping', id: pingId, ts: now });
      }

      if (now - lastChecksumSentAtRef.current >= 1200 && stateRef.current.peerConn.open) {
        lastChecksumSentAtRef.current = now;
        stateRef.current.peerConn.send({
          type: 'state_checksum',
          ts: now,
          checksum: computeNetChecksum(),
        });
      }

      if (isClient) {
        const silenceMs = performance.now() - lastSnapshotAtRef.current;
        if (silenceMs > 650) {
          stateRef.current.peerConn.send({ type: 'resync_request', ts: now });
          lastSnapshotAtRef.current = performance.now();
        }
      }
    }, 220);

    const spawnReliabilityTimer = setInterval(() => {
      if (!isClient || !stateRef.current.peerConn || stateRef.current.gameOver) return;
      const now = Date.now();
      const pendingEntries = Object.entries(pendingClientSpawnRef.current);
      if (pendingEntries.length === 0) return;

      for (const [requestId, pending] of pendingEntries) {
        const ageMs = now - pending.sentAt;
        if (ageMs > 2600) {
          // Timed-out request: rollback optimistic unit and refund elixir.
          stateRef.current.entities = stateRef.current.entities.filter(
            (entity) => !(entity.type === 'unit' && entity.pendingRequestId === requestId)
          );
          stateRef.current.elixir = Math.min(10, stateRef.current.elixir + pending.cost);
          syncUiElixir(stateRef.current.elixir);
          delete pendingClientSpawnRef.current[requestId];
          continue;
        }

        if (now - pending.lastSentAt < 170) continue;
        if (pending.retries >= 10) continue;

        stateRef.current.peerConn.send({
          type: 'spawn_request',
          ts: now,
          requestId,
          charId: pending.charId,
          x: pending.x,
          y: pending.y,
          level: pending.level,
        });
        pending.lastSentAt = now;
        pending.retries += 1;
      }
    }, 90);

    const clockTimer = setInterval(() => {
      if (stateRef.current.gameOver) return;
      if (!isBattleLiveRef.current) return;
      if (isClient) return;
      if (isExitConfirmOpenRef.current && shouldPauseForExitConfirm) return;
      stateRef.current.timeLeft -= 1;
      syncUiTimeLeft(stateRef.current.timeLeft);
      if (stateRef.current.timeLeft <= 0) {
        resolveTimeout();
      }
    }, 1000);

    return () => {
      cancelAnimationFrame(reqId);
      clearInterval(elixirTimer);
      clearInterval(clockTimer);
      clearInterval(netHealthTimer);
      clearInterval(spawnReliabilityTimer);
      if (peerConnection && typeof peerConnection.removeAllListeners === 'function') {
        peerConnection.removeAllListeners('data');
        peerConnection.removeAllListeners('close');
        peerConnection.removeAllListeners('error');
      }
      if (emojiTimeoutsRef.current.player) window.clearTimeout(emojiTimeoutsRef.current.player);
      if (emojiTimeoutsRef.current.enemy) window.clearTimeout(emojiTimeoutsRef.current.enemy);
      if (botReplyTimeoutRef.current) window.clearTimeout(botReplyTimeoutRef.current);
      if (disconnectTimeoutRef.current) window.clearTimeout(disconnectTimeoutRef.current);
      if (netSyncNoticeTimeoutRef.current) window.clearTimeout(netSyncNoticeTimeoutRef.current);
      pendingClientSpawnRef.current = {};
      processedSpawnRequestIdsRef.current.clear();
      snapshotBufferRef.current = [];
      pingSentMapRef.current = {};
      pendingAbilitiesRef.current = [];
    };
  }, []);

  const spawnUnit = (charId: string, team: Team, x: number, y: number, level?: number, pendingRequestId?: string) => {
    const char = getCharDef(charId);
    if (!char) return null;

    const unitLevel = level ?? (team === 'player' ? getPlayerLevel(charId) : 1);

    const hpMultiplier = Math.pow(1.15, unitLevel - 1);
    const damageMultiplier = Math.pow(1.15, unitLevel - 1);

    const unit: Entity = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'unit',
      team,
      x,
      y,
      hp: char.baseHp * hpMultiplier,
      maxHp: char.baseHp * hpMultiplier,
      radius: 12,
      charId: char.id,
      name: char.name,
      charType: char.type,
      level: unitLevel,
      color: char.color,
      damage: char.baseDamage * damageMultiplier,
      speed: char.speed,
      range: char.range,
      attackSpeed: char.attackSpeed,
      lastAttack: 0,
      healPerSecond: char.type === 'Sıhhiyeci' ? Math.abs(char.baseDamage * damageMultiplier) : 0,
      healRadius: char.type === 'Sıhhiyeci' ? Math.max(80, char.range) : 0,
      towerDamageMultiplier: char.towerDamageMultiplier ?? 1,
      fxTier: char.fxTier ?? 'basic',
      projectileColor: char.color,
      pendingRequestId,
    };
    stateRef.current.entities.push(unit);
    return unit.id;
  };

  const spawnTowerGuard = (team: Team, towerX: number, towerY: number, towerLevel: number) => {
    const scaledLevel = Math.max(1, Math.min(8, towerLevel));
    const hp = Math.floor(360 * Math.pow(1.1, scaledLevel - 1));
    const damage = Math.floor(46 * Math.pow(1.08, scaledLevel - 1));
    const spawnY = team === 'player' ? towerY - 24 : towerY + 24;
    const spawnX = towerX + (Math.random() * 18 - 9);
    const safe = sanitizeSpawnPosition(spawnX, spawnY, team);

    stateRef.current.entities.push({
      id: `guard_${Math.random().toString(36).slice(2, 10)}`,
      type: 'unit',
      team,
      x: safe.x,
      y: safe.y,
      hp,
      maxHp: hp,
      radius: 10,
      name: 'Muhafız',
      level: scaledLevel,
      color: team === 'player' ? '#93c5fd' : '#fca5a5',
      damage,
      charType: 'Yakın Dövüş',
      speed: 58,
      range: 28,
      attackSpeed: 1.22,
      lastAttack: 0,
      towerDamageMultiplier: 1,
      fxTier: 'basic',
      projectileColor: team === 'player' ? '#60a5fa' : '#f87171',
      isSummonedGuard: true,
    });
  };

  const getActiveTowerGuardCount = (team: Team, entities: Entity[]) =>
    entities.filter((entity) => entity.type === 'unit' && entity.team === team && entity.hp > 0 && entity.isSummonedGuard).length;

  const spawnProductionTowerGuards = (team: Team, entities: Entity[], time: number) => {
    const productionTowers = entities.filter(
      (tower) =>
        tower.type === 'tower' &&
        tower.team === team &&
        tower.hp > 0 &&
        tower.mainTowerType === 'production'
    );
    if (productionTowers.length === 0) return;

    if (time - (stateRef.current.productionPulseAt[team] ?? 0) < PRODUCTION_SPAWN_INTERVAL_MS) return;
    stateRef.current.productionPulseAt[team] = time;

    const activeGuards = getActiveTowerGuardCount(team, entities);
    const remainingCapacity = Math.max(0, PRODUCTION_MAX_ACTIVE_GUARDS - activeGuards);
    if (remainingCapacity <= 0) return;

    // Round-robin spawn across live production towers so side towers also contribute.
    for (let i = 0; i < remainingCapacity; i++) {
      const tower = productionTowers[i % productionTowers.length];
      spawnTowerGuard(team, tower.x, tower.y, tower.level ?? 1);
    }
  };

  const handleBotAI = () => {
    const s = stateRef.current;
    const now = performance.now();

    if (now - s.lastBotSpawnAt < activeBotConfig.minSpawnGapMs) return;
    if (s.enemyElixir < activeBotConfig.minElixirToSpawn) return;
    if (Math.random() > activeBotConfig.spawnChance) return;

    // Bot only uses characters available for the current league LP window.
    const nextLeague = LEAGUES[currentLeagueIndex + 1];
    const currentLeagueMaxLp = nextLeague ? nextLeague.minLp - 1 : Number.POSITIVE_INFINITY;
    const eligiblePool = INITIAL_CHARACTERS.filter((char) => char.reqLp <= currentLeagueMaxLp);
    const fallbackMinReqLp = Math.min(...INITIAL_CHARACTERS.map((char) => char.reqLp));
    const leaguePool = eligiblePool.length > 0
      ? eligiblePool
      : INITIAL_CHARACTERS.filter((char) => char.reqLp <= fallbackMinReqLp);
    const affordable = leaguePool.filter((char) => char.cost <= s.enemyElixir);
    if (affordable.length === 0) return;

    // Make bot deployment follow its current elixir state more naturally.
    const pickElixirAwarePool = () => {
      const e = s.enemyElixir;
      const costCap =
        botDifficulty === 'easy'
          ? (e < 3 ? 3 : e < 6 ? 4 : 5)
          : botDifficulty === 'medium'
            ? (e < 4 ? 3 : e < 7 ? 4 : 5)
            : (e < 4 ? 4 : e < 7 ? 5 : 6);

      const preferred = affordable.filter((char) => char.cost <= costCap);
      return preferred.length > 0 ? preferred : affordable;
    };

    const elixirAwarePool = pickElixirAwarePool();

    const char = (() => {
      if (!activeBotConfig.tactical) {
        const weighted = elixirAwarePool.map((entry) => {
          const levelPressure = Math.min(1, entry.stars / 5) * activeBotConfig.highLevelBias;
          const elixirPressure = Math.max(0.5, (s.enemyElixir - entry.cost + 1) / 4);
          return { entry, weight: 1 + levelPressure * 4 + elixirPressure };
        });
        const total = weighted.reduce((sum, item) => sum + item.weight, 0);
        let roll = Math.random() * total;
        for (const item of weighted) {
          roll -= item.weight;
          if (roll <= 0) return item.entry;
        }
        return weighted[weighted.length - 1].entry;
      }

      const playerFrontliner = s.entities
        .filter((entity) => entity.type === 'unit' && entity.team === 'player' && entity.hp > 0)
        .sort((a, b) => b.y - a.y)[0];

      const preferred = elixirAwarePool
        .filter((entry) => {
          if (!playerFrontliner) return true;
          if (playerFrontliner.charType === 'Tank') return entry.type === 'Uzak Menzil' || entry.type === 'Tank';
          if (playerFrontliner.charType === 'Uzak Menzil') return entry.type === 'Yakın Dövüş' || entry.type === 'Tank';
          return true;
        })
        .sort((a, b) => b.stars - a.stars || b.cost - a.cost);

      if (preferred.length > 0 && Math.random() < 0.78) {
        return preferred[Math.floor(Math.random() * Math.min(3, preferred.length))];
      }

      return elixirAwarePool[Math.floor(Math.random() * elixirAwarePool.length)];
    })();

    s.enemyElixir -= char.cost;
    s.lastBotSpawnAt = now;

    const x = 70 + Math.random() * 260;
    const y = 50 + Math.random() * 130;
    const level = getBotLevelForLeague();
    spawnUnit(char.id, 'enemy', x, y, level);
  };

  const updateBotPotionSystem = () => {
    if (!isBotMode || isClient || stateRef.current.gameOver) return;
    const now = performance.now();

    if (botPotionUntilRef.current.damage > 0 && now >= botPotionUntilRef.current.damage) {
      botPotionUntilRef.current.damage = 0;
      potionBuffRef.current.enemy.damage = false;
    }
    if (botPotionUntilRef.current.speed > 0 && now >= botPotionUntilRef.current.speed) {
      botPotionUntilRef.current.speed = 0;
      potionBuffRef.current.enemy.speed = false;
    }

    if (now - botPotionDecisionAtRef.current < 900) return;
    botPotionDecisionAtRef.current = now;

    const chance = botDifficulty === 'hard' ? 0.2 : botDifficulty === 'medium' ? 0.13 : 0.05;
    if (stateRef.current.enemyElixir < 1) return;

    if (!potionBuffRef.current.enemy.damage && Math.random() < chance) {
      potionBuffRef.current.enemy.damage = true;
      botPotionUntilRef.current.damage = now + 5000;
      stateRef.current.enemyElixir = Math.max(0, stateRef.current.enemyElixir - 1.1);
    }

    if (!potionBuffRef.current.enemy.speed && Math.random() < chance * 0.9) {
      potionBuffRef.current.enemy.speed = true;
      botPotionUntilRef.current.speed = now + 5000;
      stateRef.current.enemyElixir = Math.max(0, stateRef.current.enemyElixir - 1.0);
    }
  };

  const updateBotAirshipSystem = () => {
    if (!isBotMode || botDifficulty !== 'hard' || isClient || stateRef.current.gameOver) return;

    const selected = teamAirshipConfigRef.current.enemy.selected;
    if (!selected) return;

    const now = performance.now();
    if (now - botAirshipDecisionAtRef.current < 850) return;
    botAirshipDecisionAtRef.current = now;

    if ((airshipChargeRef.current.enemy[selected] ?? 0) < 100) return;
    if (Math.random() > 0.28) return;

    const randomKind = (['lockdown', 'boost', 'heal', 'reflector', 'shield'][Math.floor(Math.random() * 5)] as AirshipAbilityKind);
    const kindToUse = randomKind;
    teamAirshipConfigRef.current.enemy.selected = kindToUse;

    if (!consumeAirshipCharge('enemy', kindToUse)) return;
    applyAirshipAbility('enemy', kindToUse, now);
  };

  const dist = (e1: Entity, e2: Entity) => Math.hypot(e1.x - e2.x, e1.y - e2.y);

  const getAliveTowerCount = (team: Team) => {
    return stateRef.current.entities.filter(
      (e) => e.type === 'tower' && e.team === team && e.hp > 0,
    ).length;
  };

  const resolveTimeout = () => {
    const playerTowers = getAliveTowerCount('player');
    const enemyTowers = getAliveTowerCount('enemy');

    if (playerTowers > enemyTowers) {
      endGame('win');
      return;
    }
    if (playerTowers < enemyTowers) {
      endGame('lose');
      return;
    }
    endGame('draw');
  };

  const chooseBridgeForUnit = (unit: Entity, entities: Entity[]) => {
    const nearest = nearestBridgeX(unit.x);
    const other = nearest === LEFT_BRIDGE_X ? RIGHT_BRIDGE_X : LEFT_BRIDGE_X;

    // Near river edges, always keep nearest bridge to avoid cross-bridge snapping.
    if (isNearRiverBand(unit.y, 48)) {
      return nearest;
    }

    // Prefer closest bridge; switch only if closest lane is heavily blocked.
    const nearestCrowd = entities.filter(
      (e) =>
        e.type === 'unit' &&
        e.hp > 0 &&
        Math.abs(e.x - nearest) < BRIDGE_HALF_WIDTH + 12 &&
        Math.abs(e.y - RIVER_MID) < 72
    ).length;
    const otherCrowd = entities.filter(
      (e) =>
        e.type === 'unit' &&
        e.hp > 0 &&
        Math.abs(e.x - other) < BRIDGE_HALF_WIDTH + 12 &&
        Math.abs(e.y - RIVER_MID) < 72
    ).length;

    if (nearestCrowd - otherCrowd >= 5) {
      return other;
    }

    return nearest;
  };

  const routeThroughBridge = (unit: Entity, targetX: number, targetY: number, entities: Entity[]) => {
    let destX = targetX;
    let destY = targetY;

    const isPlayerZone = unit.y >= RIVER_BOTTOM;
    const isEnemyZone = unit.y <= RIVER_TOP;
    const isRiverZone = !isPlayerZone && !isEnemyZone;

    const isTargetPlayerZone = destY >= RIVER_BOTTOM;
    const isTargetEnemyZone = destY <= RIVER_TOP;
    const isCrossing =
      (isPlayerZone && isTargetEnemyZone) ||
      (isEnemyZone && isTargetPlayerZone) ||
      (isRiverZone && (isTargetPlayerZone || isTargetEnemyZone));

    if (!isCrossing) {
      // Reset stale bridge lock only when the unit is clearly away from river edges.
      if (!isRiverZone && !isNearRiverBand(unit.y, 36)) {
        unit.bridgeLockX = undefined;
      }
      return { destX, destY, isCrossing: false };
    }

    if (!unit.bridgeLockX) {
      unit.bridgeLockX = chooseBridgeForUnit(unit, entities);
    }
    const bridgeLaneX = unit.bridgeLockX;

    if (isPlayerZone) {
      destX = bridgeLaneX;
      destY = RIVER_TOP - 4;
    } else if (isEnemyZone) {
      destX = bridgeLaneX;
      destY = RIVER_BOTTOM + 4;
    } else if (isRiverZone) {
      destX = bridgeLaneX;
      if (isTargetEnemyZone) {
        destY = RIVER_TOP - 4;
      } else if (isTargetPlayerZone) {
        destY = RIVER_BOTTOM + 4;
      } else {
        destY = unit.team === 'player' ? RIVER_TOP - 4 : RIVER_BOTTOM + 4;
      }
    }

    return { destX, destY, isCrossing: true };
  };

  const getOwnTowerAnchor = (healer: Entity, entities: Entity[]) => {
    const ownTowers = entities.filter(
      (tower) => tower.type === 'tower' && tower.team === healer.team && tower.hp > 0
    );
    if (ownTowers.length === 0) return null;

    return ownTowers.reduce((nearest, tower) =>
      dist(healer, tower) < dist(healer, nearest) ? tower : nearest
    );
  };

  const sanitizeSpawnPosition = (x: number, y: number, team: Team = 'player') => {
    let safeX = Math.max(14, Math.min(CANVAS_W - 14, x));
    let safeY = Math.max(14, Math.min(CANVAS_H - 14, y));

    // Each side can only deploy on its own half.
    if (team === 'player') {
      safeY = Math.max(RIVER_BOTTOM + 2, safeY);
    } else {
      safeY = Math.min(RIVER_TOP - 2, safeY);
    }

    // Water hitbox is strict: only bridge tiles can be used inside river bounds.
    if (isInRiver(safeY) && !isOnBridge(safeX)) {
      const toTopEdge = Math.abs(safeY - RIVER_TOP);
      const toBottomEdge = Math.abs(safeY - RIVER_BOTTOM);
      safeY = toTopEdge <= toBottomEdge ? RIVER_TOP - 2 : RIVER_BOTTOM + 2;
    }

    return { x: safeX, y: safeY };
  };

  const resolveBridgeStuckUnit = (entity: Entity, dt: number, entities: Entity[]) => {
    const tracker = stuckTrackRef.current[entity.id] ?? { x: entity.x, y: entity.y, stuckSec: 0 };
    const movedDistance = Math.hypot(entity.x - tracker.x, entity.y - tracker.y);
    const inCriticalBridgeZone =
      isInRiver(entity.y) || Math.abs(entity.y - RIVER_TOP) < 14 || Math.abs(entity.y - RIVER_BOTTOM) < 14;
    const hasEnemyInRange = entities.some(
      (enemy) =>
        enemy.team !== entity.team &&
        enemy.hp > 0 &&
        enemy.type !== 'projectile' &&
        dist(entity, enemy) <= (entity.range ?? 20) + 4
    );

    if (!inCriticalBridgeZone) {
      tracker.stuckSec = 0;
      tracker.x = entity.x;
      tracker.y = entity.y;
      stuckTrackRef.current[entity.id] = tracker;
      return;
    }

    if (movedDistance < 0.28 && !hasEnemyInRange) {
      tracker.stuckSec += dt;
    } else {
      tracker.stuckSec = 0;
    }

    tracker.x = entity.x;
    tracker.y = entity.y;
    stuckTrackRef.current[entity.id] = tracker;

    if (tracker.stuckSec >= 0.8) {
      // Soft recovery: guide unit to its bridge lane and nearest valid river exit.
      const bridgeX = entity.bridgeLockX ?? nearestBridgeX(entity.x);
      entity.bridgeLockX = bridgeX;
      const lanePull = Math.min(1, dt * 12);
      entity.x += (bridgeX - entity.x) * lanePull;

      const exitY = entity.team === 'player' ? RIVER_TOP - 6 : RIVER_BOTTOM + 6;
      const yDir = Math.sign(exitY - entity.y);
      if (yDir !== 0) {
        entity.y += yDir * Math.max(20, (entity.speed ?? 60) * 0.65) * dt;
      }

      tracker.stuckSec = 0;
      tracker.x = entity.x;
      tracker.y = entity.y;
    }
  };

  const updateGame = (time: number) => {
    const s = stateRef.current;
    const dt = Math.min((time - s.lastTime) / 1000, 0.1); // cap dt to avoid huge jumps
    s.lastTime = time;

    impactFxRef.current = impactFxRef.current
      .map((fx) => ({
        ...fx,
        life: Math.max(0, fx.life - dt),
        radius: Math.min(fx.maxRadius, fx.radius + (fx.maxRadius / fx.maxLife) * dt),
      }))
      .filter((fx) => fx.life > 0);

    const entities = s.entities;
    const newEntities: Entity[] = [];

    if (!isClient) {
      const remainingAbilities: PendingAbility[] = [];
      for (const ability of pendingAbilitiesRef.current) {
        if (time >= ability.landsAt) {
          applyManualAbility(ability, time);
        } else {
          remainingAbilities.push(ability);
        }
      }
      pendingAbilitiesRef.current = remainingAbilities;
    } else {
      // Client applies impact visuals when remote manual abilities land.
      const remainingAbilities: PendingAbility[] = [];
      for (const ability of pendingAbilitiesRef.current) {
        if (time >= ability.landsAt) {
          pushManualAbilityImpactFx(ability);
          playHitSfx(ability.kind === 'fireball' ? 'fireball' : 'arrowrain');
        } else {
          remainingAbilities.push(ability);
        }
      }
      pendingAbilitiesRef.current = remainingAbilities;
    }

    // Production tower ability runs once per team pulse to avoid duplicate multi-tower triggers.
    spawnProductionTowerGuards('player', entities, time);
    spawnProductionTowerGuards('enemy', entities, time);

    entities.forEach(entity => {
      if (entity.hp <= 0) return;

      if (entity.type !== 'projectile' && (entity.burnRemainingMs ?? 0) > 0) {
        const burnTick = Math.min(entity.burnRemainingMs ?? 0, dt * 1000);
        entity.burnRemainingMs = Math.max(0, (entity.burnRemainingMs ?? 0) - burnTick);
        if ((entity.burnRemainingMs ?? 0) <= 0) {
          entity.burnDps = 0;
        }
        if ((entity.burnDps ?? 0) > 0) {
          applyDamageToEntity(entity, (entity.burnDps ?? 0) * (burnTick / 1000));
          if (entity.hp <= 0) {
            if (entity.type === 'unit' && entity.team === 'enemy') s.stats.enemiesKilled++;
            if (entity.type === 'tower' && entity.team === 'enemy') s.stats.towersDestroyed++;
            if (entity.isMainTower) {
              endGame(entity.team === 'enemy' ? 'win' : 'lose');
            }
            return;
          }
        }
      }

      if (entity.type !== 'projectile' && (entity.airshipHealRemainingMs ?? 0) > 0 && (entity.airshipHealPerSecond ?? 0) > 0) {
        const healTick = Math.min(entity.airshipHealRemainingMs ?? 0, dt * 1000);
        entity.airshipHealRemainingMs = Math.max(0, (entity.airshipHealRemainingMs ?? 0) - healTick);
        entity.hp = Math.min(entity.maxHp, entity.hp + (entity.airshipHealPerSecond ?? 0) * (healTick / 1000));
        if ((entity.airshipHealRemainingMs ?? 0) <= 0 || entity.hp >= entity.maxHp - 0.01) {
          entity.airshipHealRemainingMs = 0;
          entity.airshipHealPerSecond = 0;
        }
      }

      if (entity.type !== 'projectile') {
        if ((entity.freezeMarkMs ?? 0) > 0) {
          entity.freezeMarkMs = Math.max(0, (entity.freezeMarkMs ?? 0) - dt * 1000);
        }
        if ((entity.towerFlameMarkMs ?? 0) > 0) {
          entity.towerFlameMarkMs = Math.max(0, (entity.towerFlameMarkMs ?? 0) - dt * 1000);
        }
      }

      if (entity.type === 'projectile') {
        const target = entities.find(e => e.id === entity.targetId && e.hp > 0);
        if (target) {
          entity.targetX = target.x;
          entity.targetY = target.y;
        }

        const tx = entity.targetX ?? entity.x;
        const ty = entity.targetY ?? entity.y;
        const dx = tx - entity.x;
        const dy = ty - entity.y;
        const d = Math.hypot(dx, dy);
        const projectileSpeed = Math.hypot(entity.vx ?? 0, entity.vy ?? 0) || 200;
        const step = projectileSpeed * dt;
        const hitDistance = (target?.radius ?? 0) + entity.radius + 1;

        // Apply damage exactly at impact and remove projectile immediately.
        if (target && d <= Math.max(hitDistance, step)) {
          const towerScale = target.type === 'tower' ? entity.towerDamageMultiplier ?? 1 : 1;
          const dealtDamage = (entity.damage ?? 0) * towerScale;
          applyDamageToEntity(target, dealtDamage);

          if (airshipReflectUntilRef.current[target.team] > time && entity.sourceUnitId) {
            const attacker = entities.find(
              (candidate) => candidate.id === entity.sourceUnitId && candidate.hp > 0 && candidate.type !== 'projectile'
            );
            if (attacker && attacker.team !== target.team) {
              const reflectedDamage = dealtDamage * 0.5;
              applyDamageToEntity(attacker, reflectedDamage);
              impactFxRef.current.push({
                x: attacker.x,
                y: attacker.y,
                radius: 2,
                maxRadius: 22,
                life: 0.28,
                maxLife: 0.28,
                color: '#7dd3fc',
              });

              if (attacker.hp <= 0) {
                if (attacker.type === 'unit' && attacker.team === 'enemy') s.stats.enemiesKilled++;
                if (attacker.type === 'tower' && attacker.team === 'enemy') s.stats.towersDestroyed++;
                if (attacker.isMainTower) {
                  endGame(attacker.team === 'enemy' ? 'win' : 'lose');
                }
              }
            }
          }
          if (entity.slowDurationMs && entity.slowFactor && target.type === 'unit') {
            target.slowUntil = Math.max(target.slowUntil ?? 0, time + entity.slowDurationMs);
            target.slowFactor = Math.min(target.slowFactor ?? 1, entity.slowFactor);
            target.freezeMarkMs = Math.max(target.freezeMarkMs ?? 0, entity.slowDurationMs);
          }
          if ((entity.burnDurationMs ?? 0) > 0) {
            target.burnRemainingMs = Math.max(target.burnRemainingMs ?? 0, entity.burnDurationMs ?? 0);
            target.burnDps = Math.max(target.burnDps ?? 0, entity.burnDpsOnHit ?? 0);
            target.towerFlameMarkMs = Math.max(target.towerFlameMarkMs ?? 0, entity.burnDurationMs ?? 0);
          }
          playHitSfx(entity.sfxKey);

          impactFxRef.current.push({
            x: target.x,
            y: target.y,
            radius: 2,
            maxRadius: entity.fxTier === 'special' ? 24 : 16,
            life: entity.fxTier === 'special' ? 0.3 : 0.2,
            maxLife: entity.fxTier === 'special' ? 0.3 : 0.2,
            color: entity.projectileColor ?? '#ffffff',
          });

          if (target.hp <= 0) {
            if (target.type === 'unit' && target.team === 'enemy') s.stats.enemiesKilled++;
            if (target.type === 'tower' && target.team === 'enemy') s.stats.towersDestroyed++;
            if (target.isMainTower) {
              endGame(target.team === 'enemy' ? 'win' : 'lose');
            }
          }
        } else {
          if (d > 0.001) {
            entity.x += (dx / d) * step;
            entity.y += (dy / d) * step;
          }
          entity.lifeRemaining = (entity.lifeRemaining ?? 2.2) - dt;
          if ((entity.lifeRemaining ?? 0) > 0) {
            newEntities.push(entity);
          }
        }
        return;
      }

      if (entity.type === 'unit' || entity.type === 'tower') {
        // Keep all tower variants (main + side towers) in sync with selected tower type.
        if (entity.type === 'tower') {
          syncTowerCombatStats(entity);
        }

        if (entity.type === 'unit' && entity.charType === 'Sıhhiyeci' && entity.healPerSecond && entity.healRadius) {
          // Healers only restore allied units (not towers) and never exceed max HP.
          entities.forEach((ally) => {
            if (ally.team !== entity.team || ally.id === entity.id || ally.hp <= 0) return;
            if (ally.type !== 'unit') return;
            if (dist(entity, ally) > entity.healRadius!) return;

            const healedHp = ally.hp + entity.healPerSecond! * dt;
            ally.hp = Math.min(ally.maxHp, healedHp);
          });
        }

        if (entity.type === 'unit' && entity.charType === 'Sıhhiyeci') {
          const allies = entities.filter(
            (ally) => ally.team === entity.team && ally.id !== entity.id && ally.hp > 0 && ally.type === 'unit'
          );

          const supportCandidates = allies.filter((ally) => ally.charType !== 'Sıhhiyeci');
          const sortedSupport = [...supportCandidates].sort((a, b) => {
            const aRatio = a.hp / Math.max(1, a.maxHp);
            const bRatio = b.hp / Math.max(1, b.maxHp);
            if (aRatio !== bRatio) return aRatio - bRatio;
            return dist(entity, a) - dist(entity, b);
          });
          const sortedAnyAllies = [...allies].sort((a, b) => dist(entity, a) - dist(entity, b));

          const ownTowerAnchor = getOwnTowerAnchor(entity, entities);
          const followTarget = sortedSupport[0] ?? sortedAnyAllies[0] ?? ownTowerAnchor ?? null;

          if (followTarget) {
            // Healer stays one step behind the escorted ally and mirrors its tempo.
            let behindDirX = 0;
            let behindDirY = entity.team === 'player' ? 1 : -1;
            if ((followTarget as Entity).type === 'unit') {
              const threats = entities.filter(
                (enemy) => enemy.team !== entity.team && enemy.hp > 0 && enemy.type !== 'projectile'
              );
              const nearestThreat = threats
                .sort((a, b) => dist(followTarget, a) - dist(followTarget, b))[0];
              if (nearestThreat) {
                const attackDx = nearestThreat.x - followTarget.x;
                const attackDy = nearestThreat.y - followTarget.y;
                const len = Math.hypot(attackDx, attackDy);
                if (len > 0.001) {
                  behindDirX = -attackDx / len;
                  behindDirY = -attackDy / len;
                }
              }
            }

            const followDistance = Math.max(20, entity.radius + followTarget.radius + 6);
            let destX = followTarget.x + behindDirX * followDistance;
            let destY = followTarget.y + behindDirY * followDistance;
            ({ destX, destY } = routeThroughBridge(entity, destX, destY, entities));

            const followSpeedBase = (followTarget as Entity).speed ?? entity.speed ?? 70;
            const moveSpeed =
              Math.max(48, Math.min((entity.speed ?? 70) * 1.08, followSpeedBase * 1.06)) *
              getSpeedMultiplierForTeam(entity.team) *
              getSlowMultiplier(entity, time);
            const angle = Math.atan2(destY - entity.y, destX - entity.x);
            entity.x += Math.cos(angle) * moveSpeed * dt;
            entity.y += Math.sin(angle) * moveSpeed * dt;
          }

          if (isInRiver(entity.y) && !isOnBridge(entity.x)) {
            const laneX = entity.bridgeLockX ?? nearestBridgeX(entity.x);
            entity.bridgeLockX = laneX;
            const laneLimit = BRIDGE_HALF_WIDTH - 2;
            entity.x = Math.max(laneX - laneLimit, Math.min(laneX + laneLimit, entity.x));
          }

          applyRiverCornerSafety(entity, dt);

          resolveBridgeStuckUnit(entity, dt, entities);

          newEntities.push(entity);
          return;
        }

        let target: Entity | null = null;
        let minDist = Infinity;
        
        const possibleTargets = entities.filter(e => e.team !== entity.team && e.hp > 0 && e.type !== 'projectile');
        
        // Requested attack order: enemy units -> side towers -> main tower.
        let candidates = possibleTargets.filter(e => e.type === 'unit');
        if (candidates.length === 0) {
          candidates = possibleTargets.filter(e => e.type === 'tower' && !e.isMainTower);
        }
        if (candidates.length === 0) {
          candidates = possibleTargets.filter(e => e.type === 'tower' && e.isMainTower);
        }

        candidates.forEach(c => {
          const d = dist(entity, c);
          if (d < minDist) {
            minDist = d;
            target = c;
          }
        });

        if (target) {
          if (minDist <= entity.range!) {
            if (entity.type === 'unit' && entity.charType === 'Sıhhiyeci') {
              // Healers do not deal direct damage; they support via aura healing.
            } else if (time - entity.lastAttack! >= (1 / entity.attackSpeed!) * 1000) {
              const prevAttackAt = entity.lastAttack ?? 0;
              entity.lastAttack = time;
              const isTower = entity.type === 'tower';
              const towerType: MainTowerTypeId = isTower ? (entity.mainTowerType ?? 'arrow') : 'arrow';
              const pSpeed = 200;
              const angle = Math.atan2((target as Entity).y - entity.y, (target as Entity).x - entity.x);
              const unitDamageBoost = entity.type === 'unit' ? getDamageMultiplierForTeam(entity.team) : 1;
              let projectileDamage = (entity.damage ?? 0) * unitDamageBoost;
              let projectileColor = entity.projectileColor;
              let projectileFxTier = entity.fxTier;
              let slowFactor: number | undefined;
              let slowDurationMs: number | undefined;
              let burnDurationMs: number | undefined;
              let burnDpsOnHit: number | undefined;

              if (isTower && towerType === 'freeze') {
                projectileDamage *= 0.62;
                projectileColor = '#7dd3fc';
                projectileFxTier = 'special';
                slowFactor = 0.58;
                slowDurationMs = 1800;
              }

              if (isTower && towerType === 'flame') {
                const isSameTarget = entity.infernoTargetId === (target as Entity).id && time - prevAttackAt < 1300;
                const nextRamp = isSameTarget ? Math.min(2.8, (entity.infernoRamp ?? 1) + 0.22) : 1;
                entity.infernoTargetId = (target as Entity).id;
                entity.infernoRamp = nextRamp;
                projectileDamage *= nextRamp;
                projectileColor = '#fb923c';
                projectileFxTier = 'special';
                burnDurationMs = 2300;
                burnDpsOnHit = Math.max(18, projectileDamage * 0.23);
              }

              if (isTower && towerType !== 'flame') {
                entity.infernoTargetId = undefined;
                entity.infernoRamp = 1;
              }

              newEntities.push({
                id: Math.random().toString(),
                type: 'projectile',
                team: entity.team,
                x: entity.x,
                y: entity.y,
                targetX: (target as Entity).x,
                targetY: (target as Entity).y,
                targetId: (target as Entity).id,
                vx: Math.cos(angle) * pSpeed,
                vy: Math.sin(angle) * pSpeed,
                damage: projectileDamage,
                sfxKey: entity.charId,
                towerDamageMultiplier: entity.towerDamageMultiplier,
                fxTier: projectileFxTier,
                projectileColor,
                slowFactor,
                slowDurationMs,
                burnDurationMs,
                burnDpsOnHit,
                  sourceUnitId: entity.id,
                lifeRemaining: 2.2,
                hp: 1, maxHp: 1, radius: 3
              });
            }
          } else if (entity.type === 'unit') {
            let destX = (target as Entity).x;
            let destY = (target as Entity).y;
            const route = routeThroughBridge(entity, destX, destY, entities);
            destX = route.destX;
            destY = route.destY;

            const angle = Math.atan2(destY - entity.y, destX - entity.x);
            const moveSpeed =
              (entity.speed ?? 70) *
              getSpeedMultiplierForTeam(entity.team) *
              getSlowMultiplier(entity, time);
            entity.x += Math.cos(angle) * moveSpeed * dt;
            entity.y += Math.sin(angle) * moveSpeed * dt;

            // On bridges, units move freely forward/backward while staying in lane.
            if (isInRiver(entity.y) && isOnBridge(entity.x)) {
              const laneX = entity.bridgeLockX ?? nearestBridgeX(entity.x);
              entity.bridgeLockX = laneX;
              const lanePull = Math.min(1, dt * 14);
              entity.x += (laneX - entity.x) * lanePull;
              const bridgeSpeed =
                (entity.speed ?? 70) *
                1.08 *
                getSpeedMultiplierForTeam(entity.team) *
                getSlowMultiplier(entity, time);
              const yDir = Math.sign(destY - entity.y);
              if (yDir !== 0) {
                entity.y += yDir * bridgeSpeed * dt;
              }
              const laneLimit = BRIDGE_HALF_WIDTH - 2;
              entity.x = Math.max(laneX - laneLimit, Math.min(laneX + laneLimit, entity.x));
            }

            // Keep pathing stable: if unit is not crossing river anymore, release bridge lock.
            if (!route.isCrossing && !isInRiver(entity.y) && !isNearRiverBand(entity.y, 36)) {
              entity.bridgeLockX = undefined;
            }

            // Hard rule: units can never stand on river tiles unless they are on bridge tiles.
            if (isInRiver(entity.y) && !isOnBridge(entity.x)) {
              const laneX = entity.bridgeLockX ?? nearestBridgeX(entity.x);
              entity.bridgeLockX = laneX;
              entity.x = laneX;
            }

            if ((entity.team === 'player' && entity.y < RIVER_TOP - 28) || (entity.team === 'enemy' && entity.y > RIVER_BOTTOM + 28)) {
              if (!isNearRiverBand(entity.y, 36)) {
                entity.bridgeLockX = undefined;
              }
            }

            applyRiverCornerSafety(entity, dt);

            resolveBridgeStuckUnit(entity, dt, entities);
          }
        }
        newEntities.push(entity);
      }
    });

    const aliveIds = new Set(newEntities.map((entity) => entity.id));
    Object.keys(stuckTrackRef.current).forEach((id) => {
      if (!aliveIds.has(id)) {
        delete stuckTrackRef.current[id];
      }
    });

    s.entities = newEntities;
  };

  const drawGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    ctx.fillStyle = '#dcecc8';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H / 2 - 20);
    
    ctx.fillStyle = '#d2e7bb';
    ctx.fillRect(0, CANVAS_H / 2 + 20, CANVAS_W, CANVAS_H / 2 - 20);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, CANVAS_H / 2 - 20, CANVAS_W, 40);

    ctx.fillStyle = '#a16207';
    ctx.fillRect(LEFT_BRIDGE_X - BRIDGE_HALF_WIDTH, CANVAS_H / 2 - 20, BRIDGE_HALF_WIDTH * 2, 40);
    ctx.fillRect(RIGHT_BRIDGE_X - BRIDGE_HALF_WIDTH, CANVAS_H / 2 - 20, BRIDGE_HALF_WIDTH * 2, 40);

    const nowMs = performance.now();
    if (airshipFeedbackRef.current && airshipFeedbackRef.current.until <= nowMs) {
      airshipFeedbackRef.current = null;
      setAirshipFeedback(null);
    }

    pendingAbilitiesRef.current.forEach((ability) => {
      const timeLeftMs = Math.max(0, ability.landsAt - nowMs);
      const pulse = 1 + Math.sin(nowMs / 120) * 0.08;
      const radius = (ability.kind === 'fireball' ? 74 : 60) * pulse;
      const alpha = Math.max(0.2, Math.min(0.75, timeLeftMs / MANUAL_ABILITY_DELAY_MS));

      ctx.beginPath();
      ctx.arc(ability.x, ability.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = ability.kind === 'fireball' ? `rgba(249,115,22,${alpha})` : `rgba(245,158,11,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(ability.kind === 'fireball' ? '☄️' : '🏹', ability.x, ability.y + 4);
      ctx.shadowBlur = 0;
    });

    stateRef.current.entities.forEach(e => {
      if (e.type === 'tower') {
        const towerType = e.mainTowerType ?? 'arrow';
        const bodyColor = (() => {
          if (towerType === 'freeze') return e.team === 'player' ? '#38bdf8' : '#0ea5e9';
          if (towerType === 'flame') return e.team === 'player' ? '#fb923c' : '#ea580c';
          if (towerType === 'production') return e.team === 'player' ? '#a78bfa' : '#7c3aed';
          return e.team === 'player' ? '#1e3a8a' : '#7f1d1d';
        })();

        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        if (e.isMainTower) {
          ctx.rect(e.x - e.radius, e.y - e.radius, e.radius * 2, e.radius * 2);
        } else {
          ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        {
          const hpPct = Math.max(0, e.hp / e.maxHp);
          // Keep both teams readable: enemy info below, player info above.
          const towerBarY = e.team === 'enemy' ? e.y + e.radius + 6 : e.y - e.radius - 11;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(e.x - 20, towerBarY, 40, 5);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(e.x - 20, towerBarY, 40 * hpPct, 5);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 4;
          const towerHpText = `${Math.max(0, Math.ceil(e.hp))}/${Math.max(1, Math.ceil(e.maxHp))}`;
          const towerLabelY = e.team === 'enemy' ? e.y + e.radius + 24 : e.y - e.radius - 16;
          ctx.fillText(`Lv${e.level ?? 1} ${towerHpText}`, e.x, towerLabelY);
          ctx.shadowBlur = 0;
        }
      } else if (e.type === 'unit') {
        if (e.charType === 'Sıhhiyeci' && e.healRadius) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.healRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(236, 72, 153, 0.08)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = e.team === 'player' ? '#3b82f6' : '#ef4444';
        ctx.fill();

        {
          const hideEnemyBotPotionAura = isBotMode && e.team === 'enemy';
          const hasDamageFx = !hideEnemyBotPotionAura && potionBuffRef.current[e.team].damage;
          const hasSpeedFx = !hideEnemyBotPotionAura && potionBuffRef.current[e.team].speed;
          const hasAirshipBoostFx = airshipBoostUntilRef.current[e.team] > nowMs;
          const hasReflectFx = airshipReflectUntilRef.current[e.team] > nowMs;
          if (hasDamageFx || hasSpeedFx) {
            const pulse = 2 + Math.sin(performance.now() / 130) * 1.8;
            const auraColor = hasDamageFx && hasSpeedFx ? '#c084fc' : hasDamageFx ? '#ef4444' : '#38bdf8';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius + 4 + pulse, 0, Math.PI * 2);
            ctx.strokeStyle = auraColor;
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius + 1 + pulse * 0.35, 0, Math.PI * 2);
            ctx.strokeStyle = auraColor;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          if (hasAirshipBoostFx) {
            const boostPulse = 1.6 + Math.sin(performance.now() / 110) * 1.4;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius + 6 + boostPulse, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 2.2;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          if (hasReflectFx) {
            const reflectPulse = 1.2 + Math.sin(performance.now() / 95) * 1.6;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius + 7 + reflectPulse, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)';
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = 2.2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(224, 242, 254, 0.9)';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🛡', e.x, e.y - e.radius - 8);
            ctx.globalAlpha = 1;
          }
        }

        if ((e.freezeMarkMs ?? 0) > 0) {
          const freezePulse = 1 + Math.sin(performance.now() / 130) * 0.1;
          ctx.beginPath();
          ctx.arc(e.x, e.y, (e.radius + 7) * freezePulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.fillStyle = 'rgba(224, 242, 254, 0.95)';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('❄', e.x, e.y - e.radius - 8);
        }

        if ((e.towerFlameMarkMs ?? 0) > 0) {
          const flamePulse = 1 + Math.sin(performance.now() / 95) * 0.12;
          ctx.beginPath();
          ctx.arc(e.x, e.y, (e.radius + 8) * flamePulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(e.x, e.y, (e.radius + 4) * flamePulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 237, 213, 0.95)';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🔥', e.x, e.y - e.radius - 8);
        }

        if ((e.burnRemainingMs ?? 0) > 0) {
          const burnPulse = 1 + Math.sin(performance.now() / 95) * 0.12;
          ctx.beginPath();
          ctx.arc(e.x, e.y, (e.radius + 6) * burnPulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fillStyle = e.color || '#fff';
        ctx.fill();

        {
          const shieldPct = (e.shieldMaxHp ?? 0) > 0 ? Math.max(0, (e.shieldHp ?? 0) / Math.max(1, e.shieldMaxHp ?? 1)) : 0;
          const hpPct = Math.max(0, e.hp / e.maxHp);
          const usingShieldBar = (e.shieldHp ?? 0) > 0.01;
          // Player unit info is rendered in front (top side). Enemy layout stays as-is.
          const playerFrontBarY = e.y - e.radius - 10;
          const defaultEnemyBarY = e.y - e.radius - 10;
          const unitBarY = e.team === 'player' ? playerFrontBarY : defaultEnemyBarY;
          ctx.fillStyle = usingShieldBar ? '#1e3a8a' : '#ef4444';
          ctx.fillRect(e.x - 10, unitBarY, 20, 3);
          ctx.fillStyle = usingShieldBar ? '#60a5fa' : '#22c55e';
          ctx.fillRect(e.x - 10, unitBarY, 20 * (usingShieldBar ? shieldPct : hpPct), 3);

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 3;
          const unitLabelY = e.y - e.radius - 14;
          const unitLabel = `${e.name} Lv${e.level}`;
          ctx.fillText(unitLabel, e.x, unitLabelY);
          ctx.shadowBlur = 0;
        }
      } else if (e.type === 'projectile') {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fillStyle = e.projectileColor ?? (e.team === 'player' ? '#60a5fa' : '#f87171');
        ctx.fill();
      }
    });

    impactFxRef.current.forEach((fx) => {
      const alpha = Math.max(0, fx.life / fx.maxLife);
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `${fx.color}${Math.floor(alpha * 180)
        .toString(16)
        .padStart(2, '0')}`;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  const endGame = (result: 'win' | 'lose' | 'draw', force = false, reason: 'normal' | 'disconnect' = 'normal') => {
    if (stateRef.current.gameOver && !force) return;
    stateRef.current.gameOver = true;
    setGameOver(result);
    registerBattlePlayed();
    
    const s = stateRef.current;
    const timePlayed = 240 - s.timeLeft;
    
    updateQuestProgress('play_time', timePlayed);
    updateQuestProgress('destroy_towers', s.stats.towersDestroyed);
    updateQuestProgress('kill_enemies', s.stats.enemiesKilled);
    updateQuestProgress('play_matches', 1);
    if (result === 'win') {
      updateQuestProgress('win_matches', 1);
    }

    const baseTpEarned = Math.floor(timePlayed / 10) + (s.stats.towersDestroyed * 10) + s.stats.enemiesKilled;
    const baseGoldEarned = 20 + Math.floor(timePlayed / 12) + (s.stats.towersDestroyed * 15) + Math.floor(s.stats.enemiesKilled * 0.8);
    const difficultyRewardMultiplier = isBotMode ? activeBotConfig.rewardMult : 1;
    const losePenaltyMultiplier = result === 'lose' ? 0.5 : 1;
    const tpEarned = Math.floor(baseTpEarned * difficultyRewardMultiplier * losePenaltyMultiplier);
    const goldEarned = Math.floor(baseGoldEarned * difficultyRewardMultiplier * losePenaltyMultiplier);
    const lpDelta = isBotMode
      ? result === 'win'
        ? activeBotConfig.lpWin
        : result === 'lose'
          ? activeBotConfig.lpLose
          : 0
      : result === 'win'
        ? 5
        : result === 'lose'
          ? -3
          : 0;
    setBattleRewards({ gold: goldEarned, tp: tpEarned, lp: lpDelta });
    addGold(goldEarned);
    addTP(tpEarned);
    if (lpDelta !== 0) addLP(lpDelta);

    if (isHost && stateRef.current.peerConn) {
      const opponentResult: 'win' | 'lose' | 'draw' =
        result === 'win' ? 'lose' : result === 'lose' ? 'win' : 'draw';
      const opponentMultiplier = opponentResult === 'lose' ? 0.5 : 1;
      const opponentRewards = {
        gold: Math.floor(baseGoldEarned * opponentMultiplier),
        tp: Math.floor(baseTpEarned * opponentMultiplier),
        lp: opponentResult === 'win' ? 5 : opponentResult === 'lose' ? -3 : 0,
      };

      stateRef.current.peerConn.send({
        type: 'match_result',
        ts: Date.now(),
        reason,
        result: opponentResult,
        rewards: opponentRewards,
      });
    }
  };

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isBattleLiveRef.current) return;
    if (stateRef.current.gameOver || isExitConfirmOpenRef.current) return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_H / rect.height);

    if (selectedManualAbility) {
      const consumeResult = selectedManualAbility === 'arrow_rain' ? consumeArrowRainCard() : consumeFireballCard();
      if (!consumeResult.ok) {
        setSelectedManualAbility(null);
        return;
      }

      const abilityX = Math.max(18, Math.min(CANVAS_W - 18, x));
      const abilityY = Math.max(18, Math.min(CANVAS_H - 18, y));
      if (isClient && stateRef.current.peerConn) {
        stateRef.current.peerConn.send({
          type: 'ability_request',
          kind: selectedManualAbility,
          x: abilityX,
          y: abilityY,
          ts: Date.now(),
        });
      } else {
        queueManualAbility(selectedManualAbility, 'player', abilityX, abilityY);
      }

      if (isHost) {
        pushSyncSnapshot(Date.now(), true);
      }

      setSelectedManualAbility(null);
      return;
    }

    if (!selectedCard) return;

    const char = getCharDef(selectedCard);
    if (!char) return;

    // Ignore invalid taps silently: player can deploy only on their own side.
    if (y < RIVER_BOTTOM + 2) return;

    if (stateRef.current.elixir >= char.cost) {
      stateRef.current.elixir -= char.cost;
      syncUiElixir(stateRef.current.elixir);
      const level = getPlayerLevel(char.id);
      const safeSpawn = sanitizeSpawnPosition(x, y, 'player');
      unlockAudio();
      playDeploySfx();

      if (isClient && stateRef.current.peerConn) {
        const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const optimisticUnitId = spawnUnit(char.id, 'player', safeSpawn.x, safeSpawn.y, level, requestId) ?? undefined;
        pendingClientSpawnRef.current[requestId] = {
          charId: char.id,
          cost: char.cost,
          level,
          x: safeSpawn.x,
          y: safeSpawn.y,
          sentAt: now,
          lastSentAt: now,
          retries: 0,
          optimisticUnitId,
        };

        // Spawn instantly on client for low-latency input feel, host confirms/rejects.
        stateRef.current.peerConn.send({
          type: 'spawn_request',
          ts: Date.now(),
          requestId,
          charId: char.id,
          x: safeSpawn.x,
          y: safeSpawn.y,
          level,
        });
      } else {
        spawnUnit(char.id, 'player', safeSpawn.x, safeSpawn.y, level);
      }

      setSelectedCard(null);
    }
  };

  const formatTime = (s: number) => {
    const safe = Math.max(0, Math.floor(s));
    return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, '0')}`;
  };
  const selectedAirshipMeta = selectedAirshipId ? AIRSHIP_TYPES.find((item) => item.id === selectedAirshipId) : undefined;
  const selectedAirshipCharge = selectedAirshipId ? Math.floor(playerAirshipCharge[selectedAirshipId] ?? 0) : 0;
  const canActivateAirship =
    !!selectedAirshipId &&
    !!selectedAirshipMeta &&
    selectedAirshipCharge >= 100 &&
    isBattleLiveRef.current &&
    !gameOver;
  const versusLabel = isBotMode ? `${playerName}-BOT` : `${playerName}-${enemyPlayerName}`;
  const canOpenExitConfirm = !gameOver && !disconnectBanner;
  const airshipFeedbackLabel = airshipFeedback
    ? airshipFeedback.kind === 'lockdown'
      ? '⛓ LOCK-DOWN AKTİF'
      : airshipFeedback.kind === 'boost'
        ? '🚀 BOOST AKTİF'
        : airshipFeedback.kind === 'heal'
          ? '💚 ŞİFA GEMİSİ AKTİF'
          : airshipFeedback.kind === 'reflector'
            ? '🛡️ REFLECTOR AKTİF'
            : '🧿 KALKAN GEMİSİ AKTİF'
    : '';

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 overflow-hidden relative select-none">
      <div className="flex items-center justify-between p-3 bg-gray-800 z-10 shadow-md">
        <button
          onClick={() => {
            if (!canOpenExitConfirm) return;
            unlockAudio();
            playMenuClick();
            setIsExitConfirmOpen(true);
          }}
          className="p-2 bg-gray-700 rounded-full hover:bg-gray-600"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>

        <div className="flex items-center gap-3">
          <div className="h-10 min-w-[88px] rounded-lg border border-gray-500 bg-gray-900 px-3 flex items-center justify-center shadow-[0_0_0_2px_rgba(17,24,39,0.65)]">
            <span className="text-sm font-bold font-mono text-yellow-400 tracking-wide">{formatTime(timeLeft)}</span>
          </div>
          <div className="rounded-full border border-gray-600 bg-gray-900/80 px-4 py-2 text-xs font-semibold text-gray-200">
            {versusLabel}
          </div>
        </div>

        <div className="w-9" />
      </div>

      <div className="flex-1 w-full flex justify-center items-center bg-black overflow-hidden relative">
        {preMatchBanner && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 pointer-events-none">
            {preMatchBanner === 'count' ? (
              <div className="countdown-pop text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.35)]">
                {preMatchCount}
              </div>
            ) : (
              <div className="battle-go text-6xl font-black text-yellow-300 drop-shadow-[0_0_22px_rgba(250,204,21,0.55)]">
                SAVAŞ
              </div>
            )}
          </div>
        )}

        {enemyEmojiBubble && (
          <div className="emoji-pop absolute top-1/4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/95 border border-red-500/60 rounded-2xl px-3 py-1 text-2xl shadow-xl">
            {enemyEmojiBubble}
          </div>
        )}

        {playerEmojiBubble && (
          <div className="emoji-pop absolute bottom-1/4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/95 border border-blue-500/60 rounded-2xl px-3 py-1 text-2xl shadow-xl">
            {playerEmojiBubble}
          </div>
        )}

        {airshipFeedback && airshipFeedback.until > performance.now() && (
          <div
            className={`absolute left-1/2 z-20 -translate-x-1/2 rounded-xl border px-3 py-2 text-xs font-bold shadow-xl ${
              airshipFeedback.team === 'player'
                ? 'bottom-[32%] border-violet-300/70 bg-violet-900/85 text-violet-100'
                : 'top-[32%] border-rose-300/70 bg-rose-900/85 text-rose-100'
            }`}
          >
            {airshipFeedbackLabel}
          </div>
        )}

        <div className="absolute left-2 bottom-2 z-20 flex flex-col gap-1.5">
          {emojiDeck.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendEmoji(emoji)}
              className="h-9 w-9 rounded-lg bg-gray-700/95 border border-gray-500 text-xl active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="absolute right-2 bottom-40 z-20 flex flex-col gap-2 rounded-xl border border-gray-500/60 bg-gray-900/70 p-1.5 backdrop-blur-[1px]">
          {hasSelectedAirship && (
            <>
              <button
                onClick={() => {
                  if (!selectedAirshipId) return;
                  activateAirshipAbility(selectedAirshipId);
                }}
                disabled={!canActivateAirship}
                className={`relative h-12 w-12 rounded-full border-2 text-lg shadow-lg ${
                  canActivateAirship
                    ? 'bg-violet-700/95 border-violet-200 hover:bg-violet-600'
                    : 'bg-gray-800/70 border-gray-600 opacity-70'
                }`}
                title={selectedAirshipMeta ? `${selectedAirshipMeta.name} (${selectedAirshipCharge}%)` : 'Hava Saldırısı'}
              >
                {selectedAirshipMeta?.icon ?? '🛸'}
                <span className="absolute -right-1 -top-1 min-w-8 rounded-full border border-violet-200/80 bg-violet-900 px-1.5 py-[1px] text-center text-[10px] font-black leading-none text-violet-100 shadow">
                  {selectedAirshipCharge}%
                </span>
              </button>
            </>
          )}

          <button
            onClick={() => activateManualAbility('arrow_rain')}
            disabled={arrowRainCards <= 0 || !isBattleLiveRef.current || !!gameOver}
            className={`relative h-11 w-11 rounded-full border-2 text-lg shadow-lg ${
              selectedManualAbility === 'arrow_rain'
                ? 'bg-amber-500 border-amber-100'
                : arrowRainCards > 0
                  ? 'bg-gray-800/95 border-amber-400 hover:bg-gray-700'
                  : 'bg-gray-800/70 border-gray-600 opacity-60'
            }`}
            title="Ok Yağmuru"
          >
            🏹
            <span className="absolute -right-1 -top-1 min-w-6 rounded-full border border-amber-200/90 bg-amber-900 px-1.5 py-[1px] text-center text-[10px] font-black leading-none text-amber-100 shadow">
              {arrowRainCards}
            </span>
          </button>

          <button
            onClick={() => activateManualAbility('fireball')}
            disabled={fireballCards <= 0 || !isBattleLiveRef.current || !!gameOver}
            className={`relative h-11 w-11 rounded-full border-2 text-lg shadow-lg ${
              selectedManualAbility === 'fireball'
                ? 'bg-orange-500 border-orange-100'
                : fireballCards > 0
                  ? 'bg-gray-800/95 border-orange-400 hover:bg-gray-700'
                  : 'bg-gray-800/70 border-gray-600 opacity-60'
            }`}
            title="Ateş Topu"
          >
            ☄️
            <span className="absolute -right-1 -top-1 min-w-6 rounded-full border border-orange-200/90 bg-orange-900 px-1.5 py-[1px] text-center text-[10px] font-black leading-none text-orange-100 shadow">
              {fireballCards}
            </span>
          </button>

          <button
            onClick={() => activatePotion('damage')}
            disabled={localDamageBoostActive || damagePotions <= 0 || !isBattleLiveRef.current || !!gameOver}
            className={`relative h-11 w-11 rounded-full border-2 text-lg shadow-lg ${
              localDamageBoostActive
                ? 'bg-red-500/90 border-red-200'
                : damagePotions > 0
                  ? 'bg-gray-800/95 border-red-400 hover:bg-gray-700'
                  : 'bg-gray-800/70 border-gray-600 opacity-60'
            }`}
            title="Hasar İksiri"
          >
            🔥
            <span className="absolute -right-1 -top-1 min-w-6 rounded-full border border-red-200/90 bg-red-900 px-1.5 py-[1px] text-center text-[10px] font-black leading-none text-red-100 shadow">
              {damagePotions}
            </span>
          </button>

          <button
            onClick={() => activatePotion('speed')}
            disabled={localSpeedBoostActive || speedPotions <= 0 || !isBattleLiveRef.current || !!gameOver}
            className={`relative h-11 w-11 rounded-full border-2 text-lg shadow-lg ${
              localSpeedBoostActive
                ? 'bg-sky-500/90 border-sky-100'
                : speedPotions > 0
                  ? 'bg-gray-800/95 border-sky-400 hover:bg-gray-700'
                  : 'bg-gray-800/70 border-gray-600 opacity-60'
            }`}
            title="Hız İksiri"
          >
            👟
            <span className="absolute -right-1 -top-1 min-w-6 rounded-full border border-sky-200/90 bg-sky-900 px-1.5 py-[1px] text-center text-[10px] font-black leading-none text-sky-100 shadow">
              {speedPotions}
            </span>
          </button>
        </div>

        <canvas 
          ref={canvasRef} 
          width={CANVAS_W} 
          height={CANVAS_H} 
          onPointerDown={handleCanvasClick}
          className="bg-green-900 touch-none w-full max-w-md h-full object-fill"
          style={{ maxHeight: 'calc(100vh - 124px)' }}
        />

        {disconnectBanner && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-30 px-6 text-center">
            <div className="rounded-2xl border border-emerald-500/60 bg-gray-900/90 px-6 py-8">
              <p className="text-3xl font-black text-emerald-300 leading-tight">OYUNCU MAÇTAN ÇIKTI, KAZANDINIZ!</p>
            </div>
          </div>
        )}

        {netSyncNotice && (
          <div className="absolute top-24 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-cyan-400/60 bg-cyan-900/85 px-3 py-1.5 text-[11px] font-bold text-cyan-100 shadow-lg">
            {netSyncNotice}
          </div>
        )}

        {isExitConfirmOpen && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-30 px-5 text-center">
            <div className="w-full max-w-sm rounded-2xl border border-red-500/50 bg-gray-900/95 p-5">
              <p className="text-2xl font-black text-red-300 tracking-wide">ÇIKARSAN -3 LP ALIRSIN</p>
              <p className="mt-2 text-sm text-gray-300">Maçtan çıkarsan lig puanın anında düşürülür.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    unlockAudio();
                    playMenuClick();
                    if (isP2P && stateRef.current.peerConn?.open) {
                      localForfeitRef.current = true;
                      stateRef.current.peerConn.send({ type: 'forfeit', ts: Date.now() });
                    }
                    addLP(-3);
                    setIsExitConfirmOpen(false);
                    if (isP2P && stateRef.current.peerConn?.open) {
                      try {
                        stateRef.current.peerConn.close();
                      } catch {
                        // Ignore close errors; leaving battle should still continue.
                      }
                    }
                    goBack();
                  }}
                  className="rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-500"
                >
                  ÇIK
                </button>
                <button
                  onClick={() => {
                    unlockAudio();
                    playMenuClick();
                    setIsExitConfirmOpen(false);
                  }}
                  className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  DEVAM ET
                </button>
              </div>
            </div>
          </div>
        )}
        
        {gameOver && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
            <h1 className={`text-5xl font-bold mb-4 ${gameOver === 'win' ? 'text-yellow-400' : gameOver === 'draw' ? 'text-sky-300' : 'text-red-500'}`}>
              {gameOver === 'win' ? 'ZAFER!' : gameOver === 'draw' ? 'BERABERE!' : 'YENİLGİ!'}
            </h1>
            <p className="text-xl text-white mb-8">
              {gameOver === 'draw'
                ? 'Berabere: LP değişmedi'
                : battleRewards.lp > 0
                  ? `+${battleRewards.lp} LP Kazandın`
                  : `${battleRewards.lp} LP Kaybettin`}
            </p>

            <div className="mb-8 w-[86%] max-w-sm rounded-xl border border-gray-600 bg-gray-900/70 p-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-yellow-950/40 border border-yellow-700/40 py-2">
                <div className="text-xs text-yellow-300">Altın</div>
                <div className="text-lg font-extrabold text-yellow-400">+{battleRewards.gold}</div>
              </div>
              <div className="rounded-lg bg-blue-950/40 border border-blue-700/40 py-2">
                <div className="text-xs text-blue-300">TP</div>
                <div className="text-lg font-extrabold text-blue-400">+{battleRewards.tp}</div>
              </div>
              <div className="rounded-lg bg-purple-950/40 border border-purple-700/40 py-2">
                <div className="text-xs text-purple-300">LP</div>
                <div className="text-lg font-extrabold text-purple-400">{battleRewards.lp > 0 ? `+${battleRewards.lp}` : battleRewards.lp}</div>
              </div>
            </div>

            <button
              onClick={() => {
                unlockAudio();
                playMenuClick();
                goBack();
              }}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-xl"
            >
              DEVAM ET
            </button>
          </div>
        )}
      </div>

      <div className="h-36 bg-gray-800 p-2 flex flex-col gap-2 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.5)]">
        <div className="w-full bg-gray-900 rounded-full h-4 relative border border-gray-700">
          <div className="h-full bg-fuchsia-600 rounded-full transition-all duration-300" style={{ width: `${(elixir / 10) * 100}%` }} />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white shadow-black drop-shadow-md">
            {elixir} / 10 İKSİR
          </div>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 px-1 justify-center">
          {selectedCharacters
            .map((charId) => {
              const def = getCharDef(charId);
              if (!def) return null;
              return { ...def, level: getPlayerLevel(charId) };
            })
            .filter((char): char is NonNullable<typeof char> => !!char)
            .map(char => (
            <button 
              key={char.id}
              onClick={() => {
                setSelectedManualAbility(null);
                setSelectedCard(char.id === selectedCard ? null : char.id);
              }}
              disabled={elixir < char.cost}
              className={`flex-shrink-0 w-20 h-24 rounded-xl border-2 flex flex-col items-center justify-between p-1 transition-transform ${selectedCard === char.id ? 'border-yellow-400 -translate-y-2 bg-gray-700' : 'border-gray-600 bg-gray-800'} ${elixir < char.cost ? 'opacity-50 grayscale' : 'hover:bg-gray-700'}`}
            >
              <span className="text-xs font-bold text-fuchsia-400">{char.cost} 💧</span>
              <div 
                className="w-10 h-10 rounded-full shadow-md"
                style={{ backgroundColor: char.color, boxShadow: `0 0 5px ${char.color}80` }}
              />
              <span className="text-[10px] font-bold text-center leading-tight truncate w-full">{char.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}