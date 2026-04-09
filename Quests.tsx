import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { ArrowLeft, ChevronUp, Lock, Check, Layers3, Save, CheckCircle2, Pencil, Check as CheckIcon, X, Trash2, Swords, Plus } from 'lucide-react';
import { UPGRADE_COSTS, INITIAL_CHARACTERS, LEAGUES, STARTER_CHARACTER_IDS } from '../constants';

type SortKey = 'stars' | 'level' | 'hp' | 'damage' | 'speed';
type CharacterDef = (typeof INITIAL_CHARACTERS)[number];

type CompareUnit = {
  uid: string;
  side: 'left' | 'right';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  radius: number;
  charDef: CharacterDef;
  attackCd: number;
};

type CompareProjectile = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  targetUid: string;
  color: string;
};

type CompareSlot = {
  id: string;
  level: number;
};

const COMPARE_W = 360;
const COMPARE_H = 420;

export default function Characters({ goBack }: { goBack: () => void }) {
  const {
    characters: playerCharacters,
    gold,
    upgradeCharacter,
    upgradeAllByStarPriority,
    lp,
    highestLp,
    selectedCharacters,
    toggleCharacterSelection,
    clearSelectedCharacters,
    pendingTokens,
    deckSets,
    activeDeckSet,
    saveDeckSet,
    selectDeckSet,
    renameDeckSet,
    clearDeckSet,
  } = useGameStore();
  const [sortKey, setSortKey] = useState<SortKey>('stars');
  const [showDeckPanel, setShowDeckPanel] = useState(false);
  const [deckMessage, setDeckMessage] = useState('');
  const [editingDeckSlot, setEditingDeckSlot] = useState<number | null>(null);
  const [deckNameDraft, setDeckNameDraft] = useState('');
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [showComparePanel, setShowComparePanel] = useState(false);
  const [showClearSelectedConfirm, setShowClearSelectedConfirm] = useState(false);
  const [compareLeftSlots, setCompareLeftSlots] = useState<CompareSlot[]>([]);
  const [compareRightSlots, setCompareRightSlots] = useState<CompareSlot[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [compareWinner, setCompareWinner] = useState('');
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareWorldRef = useRef<{
    units: CompareUnit[];
    projectiles: CompareProjectile[];
  } | null>(null);

  const getPlayerChar = (id: string) => playerCharacters.find(c => c.id === id);

  const unlockedGateLp = Math.max(lp, highestLp ?? 0);
  const unlockedCharacters = INITIAL_CHARACTERS.filter((c) => {
    const owned = !!getPlayerChar(c.id);
    const starterException = STARTER_CHARACTER_IDS.includes(c.id);
    return owned && (unlockedGateLp >= c.reqLp || starterException);
  });
  const lockedCharacters = INITIAL_CHARACTERS.filter(c => !unlockedCharacters.some(open => open.id === c.id));

  const getSortValue = (charDef: (typeof INITIAL_CHARACTERS)[number]) => {
    const owned = getPlayerChar(charDef.id);
    const level = owned?.level ?? 0;
    const scale = Math.pow(1.15, Math.max(0, level - 1));

    switch (sortKey) {
      case 'stars':
        return charDef.stars;
      case 'level':
        return level;
      case 'hp':
        return Math.floor(charDef.baseHp * scale);
      case 'damage':
        return charDef.type === 'Sıhhiyeci' ? 0 : Math.floor(charDef.baseDamage * scale);
      case 'speed':
        return Math.floor(charDef.speed * scale);
      default:
        return charDef.stars;
    }
  };

  const sortCharacters = (chars: (typeof INITIAL_CHARACTERS)) => {
    return [...chars].sort((a, b) => {
      const diff = getSortValue(b) - getSortValue(a);
      if (diff !== 0) return diff;
      return b.stars - a.stars;
    });
  };

  const sortedUnlockedCharacters = useMemo(
    () => sortCharacters(unlockedCharacters),
    [sortKey, unlockedCharacters, playerCharacters]
  );

  const sortedLockedCharacters = useMemo(
    () => sortCharacters(lockedCharacters),
    [sortKey, lockedCharacters, playerCharacters]
  );

  const compareCharacters = useMemo(
    () =>
      [...INITIAL_CHARACTERS].sort((a, b) => {
        if (a.stars !== b.stars) return a.stars - b.stars;
        if (a.reqLp !== b.reqLp) return a.reqLp - b.reqLp;
        return a.name.localeCompare(b.name, 'tr');
      }),
    []
  );

  const renderStars = (count: number) => {
    return (
      <div className="flex justify-center gap-0.5 my-1">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className="text-yellow-400 text-[10px]">★</span>
        ))}
      </div>
    );
  };

  const getCharacterName = (id: string) => INITIAL_CHARACTERS.find((char) => char.id === id)?.name ?? id;
  const getCharacterColor = (id: string) => INITIAL_CHARACTERS.find((char) => char.id === id)?.color ?? '#9ca3af';

  useEffect(() => {
    if (compareLeftSlots.length > 0 && compareRightSlots.length > 0) return;
    const first = compareCharacters[0]?.id ?? '';
    const second = compareCharacters[1]?.id ?? first;
    setCompareLeftSlots([{ id: first, level: 1 }]);
    setCompareRightSlots([{ id: second, level: 1 }]);
  }, [compareCharacters, compareLeftSlots.length, compareRightSlots.length]);

  const updateCompareSlot = (
    side: 'left' | 'right',
    index: number,
    patch: Partial<CompareSlot>,
  ) => {
    const setter = side === 'left' ? setCompareLeftSlots : setCompareRightSlots;
    setter((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
    setCompareWinner('');
    setSimRunning(false);
  };

  const addCompareSlot = (side: 'left' | 'right') => {
    const setter = side === 'left' ? setCompareLeftSlots : setCompareRightSlots;
    const fallbackId = compareCharacters[0]?.id ?? '';
    setter((prev) => [...prev, { id: fallbackId, level: 1 }]);
    setCompareWinner('');
    setSimRunning(false);
  };

  const removeCompareSlot = (side: 'left' | 'right', index: number) => {
    const setter = side === 'left' ? setCompareLeftSlots : setCompareRightSlots;
    setter((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setCompareWinner('');
    setSimRunning(false);
  };

  useEffect(() => {
    if (!showComparePanel || !simRunning || compareLeftSlots.length === 0 || compareRightSlots.length === 0) return;
    const canvas = compareCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buildUnit = (
      uid: string,
      side: 'left' | 'right',
      charDef: CharacterDef,
      level: number,
      x: number,
      y: number,
    ): CompareUnit => {
      const scale = Math.pow(1.15, Math.max(0, level - 1));
      const maxHp = Math.max(1, Math.floor(charDef.baseHp * scale));
      return {
        uid,
        side,
        x,
        y,
        hp: maxHp,
        maxHp,
        level,
        radius: 12,
        charDef,
        attackCd: 0,
      };
    };

    const resetWorld = () => {
      const leftUnits: CompareUnit[] = compareLeftSlots
        .map((slot, index) => {
          const def = INITIAL_CHARACTERS.find((c) => c.id === slot.id);
          if (!def) return null;
          const xOffset = ((index % 3) - 1) * 34;
          const rowOffset = Math.floor(index / 3) * 24;
          return buildUnit(`left-${index}-${slot.id}`, 'left', def, slot.level, 180 + xOffset, COMPARE_H - 86 - rowOffset);
        })
        .filter(Boolean) as CompareUnit[];

      const rightUnits: CompareUnit[] = compareRightSlots
        .map((slot, index) => {
          const def = INITIAL_CHARACTERS.find((c) => c.id === slot.id);
          if (!def) return null;
          const xOffset = ((index % 3) - 1) * 34;
          const rowOffset = Math.floor(index / 3) * 24;
          return buildUnit(`right-${index}-${slot.id}`, 'right', def, slot.level, 180 + xOffset, 86 + rowOffset);
        })
        .filter(Boolean) as CompareUnit[];

      if (leftUnits.length === 0 || rightUnits.length === 0) {
        return null;
      }

      compareWorldRef.current = {
        units: [...leftUnits, ...rightUnits],
        projectiles: [],
      };
      return compareWorldRef.current;
    };

    const initialWorld = resetWorld();
    if (!initialWorld) {
      setSimRunning(false);
      return;
    }

    const routeToTarget = (_unit: CompareUnit, target: CompareUnit) => ({
      destX: target.x,
      destY: target.y,
    });

    const getDamage = (unit: CompareUnit) => {
      const scale = Math.pow(1.15, Math.max(0, unit.level - 1));
      if (unit.charDef.type === 'Sıhhiyeci') {
        return Math.max(8, Math.floor(Math.abs(unit.charDef.baseDamage) * 0.45 * scale));
      }
      return Math.max(1, Math.floor(unit.charDef.baseDamage * scale));
    };

    const getRange = (unit: CompareUnit) => Math.max(20, unit.charDef.range);
    const getAtkSpeed = (unit: CompareUnit) => Math.max(0.4, unit.charDef.attackSpeed);
    const getSpeed = (unit: CompareUnit) => Math.max(18, unit.charDef.speed);

    let rafId = 0;
    let last = performance.now();
    let projectileSeq = 0;

    const drawMap = () => {
      ctx.clearRect(0, 0, COMPARE_W, COMPARE_H);
      // Comparison arena is intentionally flat (no river/bridge) for clear side-by-side combat preview.
      const bg = ctx.createLinearGradient(0, 0, 0, COMPARE_H);
      bg.addColorStop(0, '#dcecc8');
      bg.addColorStop(1, '#d2e7bb');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, COMPARE_W, COMPARE_H);
    };

    const drawUnit = (unit: CompareUnit) => {
      const hpPct = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, unit.radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = unit.side === 'left' ? '#3b82f6' : '#ef4444';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(unit.x, unit.y, unit.radius, 0, Math.PI * 2);
      ctx.fillStyle = unit.charDef.color;
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(unit.x - 12, unit.y - unit.radius - 12, 24, 4);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(unit.x - 12, unit.y - unit.radius - 12, 24 * hpPct, 4);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${unit.charDef.name} Lv.${unit.level}`, unit.x, unit.y - unit.radius - 16);
    };

    const loop = (now: number) => {
      const world = compareWorldRef.current;
      if (!world) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const aliveUnits = world.units.filter((u) => u.hp > 0);

      const updateUnit = (self: CompareUnit) => {
        const enemies = aliveUnits.filter((u) => u.side !== self.side);
        if (enemies.length === 0) return;
        const other = enemies.reduce((best, cur) => {
          const curDist = Math.hypot(cur.x - self.x, cur.y - self.y);
          const bestDist = Math.hypot(best.x - self.x, best.y - self.y);
          return curDist < bestDist ? cur : best;
        });

        self.attackCd = Math.max(0, self.attackCd - dt);
        const dx = other.x - self.x;
        const dy = other.y - self.y;
        const dist = Math.hypot(dx, dy);
        const range = getRange(self);

        if (dist > range) {
          const route = routeToTarget(self, other);
          const mdx = route.destX - self.x;
          const mdy = route.destY - self.y;
          const mDist = Math.hypot(mdx, mdy);
          if (mDist > 0.01) {
            const spd = getSpeed(self);
            self.x += (mdx / mDist) * spd * dt;
            self.y += (mdy / mDist) * spd * dt;
          }

          self.x = Math.max(14, Math.min(COMPARE_W - 14, self.x));
          self.y = Math.max(14, Math.min(COMPARE_H - 14, self.y));
          return;
        }

        if (self.attackCd > 0) return;

        self.attackCd = 1 / getAtkSpeed(self);
        if (self.charDef.type === 'Uzak Menzil') {
          const pDist = Math.max(1, Math.hypot(dx, dy));
          world.projectiles.push({
              id: `p-${projectileSeq++}`,
            x: self.x,
            y: self.y,
            vx: (dx / pDist) * 280,
            vy: (dy / pDist) * 280,
            damage: getDamage(self),
              targetUid: other.uid,
            color: self.side === 'left' ? '#60a5fa' : '#f87171',
          });
        } else {
          other.hp -= getDamage(self);
        }
      };

      aliveUnits.forEach((unit) => updateUnit(unit));

      world.projectiles = world.projectiles.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const target = world.units.find((u) => u.uid === p.targetUid && u.hp > 0);
        if (!target) return false;
        if (Math.hypot(target.x - p.x, target.y - p.y) <= target.radius + 3) {
          target.hp -= p.damage;
          return false;
        }
        return p.x >= -10 && p.x <= COMPARE_W + 10 && p.y >= -10 && p.y <= COMPARE_H + 10;
      });

      drawMap();
      world.units
        .filter((u) => u.hp > 0)
        .forEach((u) => drawUnit(u));

      world.projectiles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });

      const leftAlive = world.units.filter((u) => u.side === 'left' && u.hp > 0);
      const rightAlive = world.units.filter((u) => u.side === 'right' && u.hp > 0);

      if (leftAlive.length === 0 || rightAlive.length === 0) {
        const winnerName =
          leftAlive.length === 0 && rightAlive.length === 0
            ? 'Berabere'
            : leftAlive.length > 0
              ? leftAlive.length === 1
                ? leftAlive[0].charDef.name
                : 'Sol Takım'
              : rightAlive.length === 1
                ? rightAlive[0].charDef.name
                : 'Sağ Takım';
        setCompareWinner(winnerName);
        setSimRunning(false);
        return;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [showComparePanel, simRunning, compareLeftSlots, compareRightSlots]);

  const startComparison = () => {
    const hasLeft = compareLeftSlots.some((slot) => !!slot.id);
    const hasRight = compareRightSlots.some((slot) => !!slot.id);
    if (!hasLeft || !hasRight) return;
    setCompareWinner('');
    setSimRunning(true);
  };

  const handleSaveDeck = (slot: number) => {
    const result = saveDeckSet(slot);
    setDeckMessage(result.message);
  };

  const handleSelectDeck = (slot: number) => {
    const result = selectDeckSet(slot);
    setDeckMessage(result.message);
  };

  const handleStartRenameDeck = (slot: number, currentName: string) => {
    setDeckMessage('');
    setEditingDeckSlot(slot);
    setDeckNameDraft(currentName);
  };

  const handleApplyRenameDeck = () => {
    if (editingDeckSlot === null) return;
    const result = renameDeckSet(editingDeckSlot, deckNameDraft);
    setDeckMessage(result.message);
    if (result.ok) {
      setEditingDeckSlot(null);
      setDeckNameDraft('');
    }
  };

  const handleClearDeck = (slot: number) => {
    const result = clearDeckSet(slot);
    setDeckMessage(result.message);
  };

  const handleUpgradeAll = () => {
    const result = upgradeAllByStarPriority();
    setUpgradeMessage(result.message);
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-gray-900 p-4 relative overflow-hidden">
      <div className="flex items-center mb-6 shrink-0">
        <button onClick={goBack} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700">
          <ArrowLeft size={24} className="text-white" />
        </button>
        <div className="ml-4 flex-1 flex items-center gap-2">
          <h1 className="text-2xl font-bold flex-1">KARTLARIM</h1>
          <button
            onClick={() => {
              setCompareWinner('');
              setShowComparePanel(true);
            }}
            className="h-11 min-w-11 px-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 flex items-center justify-center"
            aria-label="Karakter Karşılaştırma"
          >
            <Swords size={21} className="text-orange-300" />
          </button>
          <button
            onClick={() => setShowClearSelectedConfirm(true)}
            className="h-11 min-w-11 px-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 flex items-center justify-center"
            aria-label="Seçili Karakterleri Temizle"
            title="Seçili Karakterleri Temizle"
          >
            <Trash2 size={20} className="text-red-300" />
          </button>
          <button
            onClick={() => {
              setDeckMessage('');
              setShowDeckPanel(true);
            }}
            className="h-11 min-w-11 px-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 flex items-center justify-center"
            aria-label="Deste Setleri"
          >
            <Layers3 size={22} className="text-cyan-300" />
          </button>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-6 bg-gray-800 p-3 rounded-xl shadow-inner border border-gray-700 shrink-0">
        <span className="text-gray-400">Mevcut Altın:</span>
        <span className="text-xl font-bold text-yellow-400">{gold} 🪙</span>
      </div>

      <button
        onClick={handleUpgradeAll}
        className="mb-4 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm flex items-center justify-center gap-2 shrink-0"
      >
        <ChevronUp size={18} /> YILDIZA GÖRE OTOMATİK YÜKSELT
      </button>

      {upgradeMessage && (
        <div className="mb-4 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-indigo-200 shrink-0">
          {upgradeMessage}
        </div>
      )}

      <div className="mb-4 bg-gray-800 border border-gray-700 rounded-xl p-3 shrink-0">
        <div className="text-xs font-bold text-gray-300 mb-2">Sıralama Filtresi (Büyükten Küçüğe)</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSortKey('stars')}
            className={`rounded-lg py-2 text-sm font-semibold ${sortKey === 'stars' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
          >
            Yıldıza Göre
          </button>
          <button
            onClick={() => setSortKey('level')}
            className={`rounded-lg py-2 text-sm font-semibold ${sortKey === 'level' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
          >
            Seviyeye Göre
          </button>
          <button
            onClick={() => setSortKey('hp')}
            className={`rounded-lg py-2 text-sm font-semibold ${sortKey === 'hp' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
          >
            Cana Göre
          </button>
          <button
            onClick={() => setSortKey('damage')}
            className={`rounded-lg py-2 text-sm font-semibold ${sortKey === 'damage' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
          >
            Hasara Göre
          </button>
          <button
            onClick={() => setSortKey('speed')}
            className={`rounded-lg py-2 text-sm font-semibold col-span-2 ${sortKey === 'speed' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
          >
            Hıza Göre
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4 pr-1 space-y-6">
        
        <div>
          <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-1">
            <h2 className="text-lg font-bold text-green-400">Açık Karakterler ({unlockedCharacters.length})</h2>
            <div className={`text-sm font-bold px-2 py-1 rounded ${selectedCharacters.length === 4 ? 'bg-green-600/20 text-green-400 border border-green-600/50' : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50'}`}>
              Seçilen: {selectedCharacters.length} / 4
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {sortedUnlockedCharacters.map(charDef => {
               const pChar = getPlayerChar(charDef.id);
               if (!pChar) return null;
              const level = pChar.level;
              const tokens = pChar.tokens;
              const cost = level < 8 ? UPGRADE_COSTS.find(c => c.nextLevel === level + 1) : null;
              const canUpgrade = cost && gold >= cost.gold && tokens >= cost.tokens;
              const isSelected = selectedCharacters.includes(charDef.id);
              
              const currentHp = Math.floor(charDef.baseHp * Math.pow(1.15, level - 1));
              const currentDmg = charDef.type === 'Sıhhiyeci' ? 0 : Math.floor(charDef.baseDamage * Math.pow(1.15, level - 1));
              const currentSpeed = Math.floor(charDef.speed * Math.pow(1.15, level - 1));
              const currentHeal = charDef.type === 'Sıhhiyeci' ? Math.floor(Math.abs(charDef.baseDamage) * Math.pow(1.15, level - 1)) : 0;

              return (
                <div key={charDef.id} className="-m-2 p-2">
                  <div
                    onClick={() => toggleCharacterSelection(charDef.id)}
                    className={`bg-gray-800 rounded-2xl p-3.5 flex flex-col items-center shadow-lg border-2 relative overflow-hidden transition-all cursor-pointer ${isSelected ? 'border-green-500 shadow-green-900/50 scale-[1.02]' : 'border-gray-700'}`}
                  >
                  <div className={`absolute top-0 left-0 px-2 py-1 rounded-br-lg text-[10px] font-bold z-10 flex items-center gap-1 ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                    {isSelected ? <><Check size={12}/> SEÇİLDİ</> : 'SEÇ'}
                  </div>

                  <div className="absolute top-0 right-0 bg-gray-900 px-2 py-1 rounded-bl-lg text-[10px] text-gray-400 border-b border-l border-gray-700 uppercase font-bold">
                    {charDef.type}
                  </div>

                  <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mt-3 mb-1 border border-gray-700 shadow-inner">
                    <div 
                      className="w-8 h-8 rounded-full shadow-md"
                      style={{ backgroundColor: charDef.color, boxShadow: `0 0 10px ${charDef.color}80` }}
                    />
                  </div>
                  
                  {renderStars(charDef.stars)}
                  
                  <h3 className="font-bold text-sm leading-tight text-center">{charDef.name}</h3>
                  <span className="text-xs text-blue-400 font-bold mb-2">Seviye {level}</span>
                  
                  <div className="w-full space-y-1 mb-4 bg-gray-900/50 p-2 rounded">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-400">Can:</span>
                      <span className="font-bold text-red-400">{currentHp}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-400">Hasar:</span>
                      <span className="font-bold text-orange-400">{currentDmg}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-400">Hız:</span>
                      <span className="font-bold text-cyan-300">{currentSpeed}</span>
                    </div>
                    {charDef.type === 'Sıhhiyeci' && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-400">İyileştirme/sn:</span>
                        <span className="font-bold text-pink-300">+{currentHeal}</span>
                      </div>
                    )}
                  </div>

                  {cost ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canUpgrade) {
                          upgradeCharacter(charDef.id);
                        }
                      }}
                      className={`w-full py-2 rounded-lg flex flex-col items-center justify-center transition-colors ${canUpgrade ? 'bg-green-600 hover:bg-green-500 shadow-md shadow-green-900' : 'bg-gray-700 text-gray-400'}`}
                    >
                      <div className="flex items-center gap-1 font-bold text-sm">
                        <ChevronUp size={16} /> YÜKSELT
                      </div>
                      <div className="text-[10px] flex gap-1 mt-0.5">
                        <span className={tokens >= cost.tokens ? 'text-white' : 'text-red-400'}>{tokens}/{cost.tokens} Jeton</span>
                        <span>-</span>
                        <span className={gold >= cost.gold ? 'text-yellow-400' : 'text-red-400'}>{cost.gold} 🪙</span>
                      </div>
                    </button>
                  ) : (
                    <div className="w-full py-2 bg-yellow-600/20 border border-yellow-600/50 text-yellow-500 rounded-lg text-center font-bold text-xs">
                      MAKSİMUM SEVİYE
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {lockedCharacters.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-red-400 mb-3 border-b border-gray-700 pb-1 mt-4">Kapalı Karakterler ({lockedCharacters.length})</h2>
            <div className="grid grid-cols-2 gap-3 opacity-75">
              {sortedLockedCharacters.map(charDef => {
                const reqLeague = LEAGUES.slice().reverse().find(l => charDef.reqLp >= l.minLp)?.name || 'Bilinmiyor';
                const lockedDamage = charDef.type === 'Sıhhiyeci' ? 0 : Math.floor(charDef.baseDamage);
                const lockedSpeed = Math.floor(charDef.speed);
                const canOpenFromChest = unlockedGateLp >= charDef.reqLp;

                return (
                  <div key={charDef.id} className="bg-gray-800 rounded-2xl p-3.5 flex flex-col items-center shadow-lg border border-gray-700 relative grayscale">
                    <div className="absolute inset-0 bg-black/40 z-10 rounded-2xl flex flex-col items-center justify-center gap-2 backdrop-blur-[1px]">
                      <Lock size={32} className="text-red-400 drop-shadow-md" />
                      {canOpenFromChest ? (
                        <div className="text-center bg-emerald-900/90 border border-emerald-500/60 px-2 py-1 rounded text-xs font-extrabold text-emerald-200">
                          AÇMAK İÇİN KASA AÇ
                        </div>
                      ) : (
                        <div className="text-center bg-black/80 px-2 py-1 rounded text-xs font-bold text-white">
                          {reqLeague} Ligi<br/>({charDef.reqLp} LP)
                        </div>
                      )}
                    </div>

                    <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mt-3 mb-1 border border-gray-700 shadow-inner">
                      <div 
                        className="w-8 h-8 rounded-full shadow-md"
                        style={{ backgroundColor: charDef.color }}
                      />
                    </div>
                    
                    {renderStars(charDef.stars)}
                    
                    <h3 className="font-bold text-sm leading-tight text-center">{charDef.name}</h3>
                    <div className="w-full space-y-1 mb-2 mt-2 bg-gray-900/50 p-2 rounded">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-400">Tipi:</span>
                        <span className="font-bold text-gray-300">{charDef.type}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-400">Hasar:</span>
                        <span className="font-bold text-orange-400">{lockedDamage}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-400">Hız:</span>
                        <span className="font-bold text-cyan-300">{lockedSpeed}</span>
                      </div>
                      {charDef.type === 'Sıhhiyeci' && (
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-400">İyileştirme/sn:</span>
                          <span className="font-bold text-pink-300">+{Math.abs(Math.floor(charDef.baseDamage))}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-400">Birikmiş Jeton:</span>
                        <span className="font-bold text-purple-300">{pendingTokens[charDef.id] ?? 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {showDeckPanel && (
        <div className="absolute inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">DESTE SETLERİ</h2>
              <button
                onClick={() => setShowDeckPanel(false)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold"
              >
                KAPAT
              </button>
            </div>

            <div className="text-xs text-gray-300 mb-3">
              Her sete 4 karakter kaydedebilirsin. Maç sırasında set değiştirilemez.
            </div>

            <div className="space-y-3">
              {deckSets.map((deck) => {
                const hasDeck = deck.characterIds.length === 4;
                const isActive = activeDeckSet === deck.slot;
                const isEditing = editingDeckSlot === deck.slot;

                return (
                  <div
                    key={deck.slot}
                    className={`rounded-xl border p-3 ${isActive ? 'border-cyan-500 bg-cyan-900/20' : 'border-gray-700 bg-gray-900/40'}`}
                  >
                      <div className="flex items-center justify-between mb-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-1 mr-2">
                          <input
                            type="text"
                            value={deckNameDraft}
                            onChange={(e) => setDeckNameDraft(e.target.value)}
                            maxLength={16}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm"
                          />
                          <button
                            onClick={handleApplyRenameDeck}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-500"
                            aria-label="Set adını kaydet"
                          >
                            <CheckIcon size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingDeckSlot(null);
                              setDeckNameDraft('');
                            }}
                            className="p-1 rounded bg-gray-700 hover:bg-gray-600"
                            aria-label="Vazgeç"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="font-bold flex items-center gap-2">
                          <span className="truncate max-w-[180px]">{deck.name}</span>
                          <button
                            onClick={() => handleStartRenameDeck(deck.slot, deck.name)}
                            className="p-1 rounded bg-gray-700 hover:bg-gray-600"
                            aria-label="Set adını düzenle"
                          >
                            <Pencil size={13} />
                          </button>
                            <button
                              onClick={() => handleClearDeck(deck.slot)}
                              className="p-1 rounded bg-red-900/70 hover:bg-red-800 text-red-100"
                              aria-label="Seti sil"
                            >
                              <Trash2 size={13} />
                            </button>
                        </div>
                      )}
                      {isActive && (
                        <div className="text-[11px] px-2 py-0.5 rounded bg-cyan-600/20 border border-cyan-500/40 text-cyan-200">
                          AKTİF
                        </div>
                      )}
                    </div>

                    {hasDeck ? (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {deck.characterIds.map((charId) => (
                          <div key={`${deck.slot}-${charId}`} className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: getCharacterColor(charId) }}
                            />
                            <span className="text-xs truncate">{getCharacterName(charId)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mb-3 text-sm text-gray-400 border border-dashed border-gray-600 rounded-lg py-2 text-center">
                        Boş set yuvası
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSaveDeck(deck.slot)}
                        className="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-bold flex items-center justify-center gap-1"
                      >
                        <Save size={16} /> SETİ KAYDET
                      </button>
                      <button
                        onClick={() => handleSelectDeck(deck.slot)}
                        className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 size={16} /> SETİ SEÇ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {deckMessage && (
              <div className="mt-3 text-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-cyan-200">
                {deckMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {showComparePanel && (
        <div className="absolute inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">KARAKTER KARŞILAŞTIRMA</h2>
              <button
                onClick={() => setShowComparePanel(false)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold"
              >
                KAPAT
              </button>
            </div>

            <p className="text-xs text-gray-300 mb-3">
              Bu alan sadece görsel karşılaştırma animasyonudur, oyunun ilerleyişini etkilemez.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-blue-800/60 bg-blue-950/20 p-3 space-y-2">
                <div className="text-xs text-blue-300 font-bold">Sol Taraf</div>
                {compareLeftSlots.map((slot, idx) => {
                  const canRemoveLeft = compareLeftSlots.length > 1;
                  return (
                  <div key={`left-slot-${idx}`} className="relative rounded-md border border-gray-700 bg-gray-900/70 p-2 space-y-2 min-w-0">
                    <button
                      onClick={() => removeCompareSlot('left', idx)}
                      disabled={!canRemoveLeft}
                      className="absolute -left-2 top-1/2 -translate-y-1/2 h-7 w-7 shrink-0 rounded-full border border-red-500/70 bg-red-900/90 text-[11px] font-bold text-red-100 transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 z-10"
                      aria-label="Sol karakteri kaldır"
                      title={canRemoveLeft ? 'Kaldır' : 'En az 1 karakter kalmalı'}
                    >
                      X
                    </button>
                    <div className="flex items-center gap-2 min-w-0 pl-5">
                      <select
                        value={slot.id}
                        onChange={(e) => updateCompareSlot('left', idx, { id: e.target.value })}
                        className="w-full min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs"
                      >
                        {compareCharacters.map((charDef) => (
                          <option key={`left-${idx}-${charDef.id}`} value={charDef.id}>
                            {charDef.name} ({charDef.stars}★)
                          </option>
                        ))}
                      </select>
                    </div>
                    <select
                      value={slot.level}
                      onChange={(e) => updateCompareSlot('left', idx, { level: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    >
                      {Array.from({ length: 8 }).map((_, levelIdx) => {
                        const level = levelIdx + 1;
                        return (
                          <option key={`left-level-${idx}-${level}`} value={level}>
                            Seviye {level}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  );
                })}
                <button
                  onClick={() => addCompareSlot('left')}
                  className="w-full h-9 rounded-lg border border-dashed border-blue-400/60 bg-blue-900/20 hover:bg-blue-900/35 text-blue-200 font-bold text-xs flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> KARAKTER EKLE
                </button>
              </div>

              <div className="rounded-lg border border-red-800/60 bg-red-950/20 p-3 space-y-2">
                <div className="text-xs text-red-300 font-bold">Sağ Taraf</div>
                {compareRightSlots.map((slot, idx) => {
                  const canRemoveRight = compareRightSlots.length > 1;
                  return (
                  <div key={`right-slot-${idx}`} className="relative rounded-md border border-gray-700 bg-gray-900/70 p-2 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 pr-5">
                      <select
                        value={slot.id}
                        onChange={(e) => updateCompareSlot('right', idx, { id: e.target.value })}
                        className="w-full min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs"
                      >
                        {compareCharacters.map((charDef) => (
                          <option key={`right-${idx}-${charDef.id}`} value={charDef.id}>
                            {charDef.name} ({charDef.stars}★)
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => removeCompareSlot('right', idx)}
                      disabled={!canRemoveRight}
                      className="absolute -right-2 top-1/2 -translate-y-1/2 h-7 w-7 shrink-0 rounded-full border border-red-500/70 bg-red-900/90 text-[11px] font-bold text-red-100 transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 z-10"
                      aria-label="Sağ karakteri kaldır"
                      title={canRemoveRight ? 'Kaldır' : 'En az 1 karakter kalmalı'}
                    >
                      X
                    </button>
                    <select
                      value={slot.level}
                      onChange={(e) => updateCompareSlot('right', idx, { level: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs"
                    >
                      {Array.from({ length: 8 }).map((_, levelIdx) => {
                        const level = levelIdx + 1;
                        return (
                          <option key={`right-level-${idx}-${level}`} value={level}>
                            Seviye {level}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  );
                })}
                <button
                  onClick={() => addCompareSlot('right')}
                  className="w-full h-9 rounded-lg border border-dashed border-red-400/60 bg-red-900/20 hover:bg-red-900/35 text-red-200 font-bold text-xs flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> KARAKTER EKLE
                </button>
              </div>
            </div>

            <button
              onClick={startComparison}
              className="w-full mb-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 font-bold"
            >
              KARŞILAŞTIRMAYI BAŞLAT
            </button>

            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-3">
              <canvas
                ref={compareCanvasRef}
                width={COMPARE_W}
                height={COMPARE_H}
                className="w-full rounded-xl border border-gray-700 bg-gray-950"
              />
              {compareWinner && (
                <div className="mt-3 text-center text-sm font-bold text-emerald-300">
                  Kazanan: {compareWinner}
                </div>
              )}
              {!simRunning && (
                <div className="mt-2 text-center text-xs text-gray-400">
                  Simülasyon için KARŞILAŞTIRMAYI BAŞLAT tuşuna bas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showClearSelectedConfirm && (
        <div className="absolute inset-0 bg-black/75 z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-2xl p-4">
            <p className="text-center text-lg font-black text-red-300">SEÇİLİ KARAKTERLER KALDIRILCAK</p>
            <p className="mt-2 text-center text-xs text-gray-300">Bu işlem sadece savaşta seçili karakterleri temizler, kartların seviyesine dokunmaz.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  clearSelectedCharacters();
                  setShowClearSelectedConfirm(false);
                }}
                className="rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-500"
              >
                EVET
              </button>
              <button
                onClick={() => setShowClearSelectedConfirm(false)}
                className="rounded-lg bg-gray-700 py-2 text-sm font-bold text-white hover:bg-gray-600"
              >
                İPTAL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
