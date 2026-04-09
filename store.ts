import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store';
import { INITIAL_CHARACTERS as CHARACTERS, getLeague, LEAGUES } from '../constants';
import { v4 as uuidv4 } from 'uuid';

export interface Entity {
  id: string;
  type: 'unit' | 'tower' | 'mainTower';
  owner: 'player' | 'enemy';
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  range: number;
  lastAttack: number;
  level: number;
}

export const ARENA_WIDTH = 400;
export const ARENA_HEIGHT = 600;
export const TICK_RATE = 50; // 50ms per tick

export function useBattleEngine(onGameOver: (result: 'win' | 'loss', stats: any) => void) {
  const { lp, characters } = useGameStore();
  const league = getLeague(lp);
  
  const [entities, setEntities] = useState<Entity[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(240); // 4 minutes
  const [elixir, setElixir] = useState(5);
  const [, setEnemyElixir] = useState(5);
  
  const statsRef = useRef({
    towersDestroyed: 0,
    enemiesKilled: 0,
    startTime: Date.now()
  });

  const lastTickRef = useRef(Date.now());
  const gameRunningRef = useRef(true);

  // Initialize Towers
  useEffect(() => {
    const initEntities: Entity[] = [
      // Player Towers
      { id: 'p_main', type: 'mainTower', owner: 'player', name: 'Ana Kule', x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 30, hp: 3000, maxHp: 3000, damage: 100, speed: 0, range: 120, lastAttack: 0, level: 1 },
      { id: 'p_t1', type: 'tower', owner: 'player', name: 'Kule 1', x: 80, y: ARENA_HEIGHT - 120, hp: 1500, maxHp: 1500, damage: 80, speed: 0, range: 100, lastAttack: 0, level: 1 },
      { id: 'p_t2', type: 'tower', owner: 'player', name: 'Kule 2', x: ARENA_WIDTH - 80, y: ARENA_HEIGHT - 120, hp: 1500, maxHp: 1500, damage: 80, speed: 0, range: 100, lastAttack: 0, level: 1 },
      
      // Enemy Towers
      { id: 'e_main', type: 'mainTower', owner: 'enemy', name: 'Ana Kule', x: ARENA_WIDTH / 2, y: 30, hp: 3000, maxHp: 3000, damage: 100, speed: 0, range: 120, lastAttack: 0, level: 1 },
      { id: 'e_t1', type: 'tower', owner: 'enemy', name: 'Kule 1', x: 80, y: 120, hp: 1500, maxHp: 1500, damage: 80, speed: 0, range: 100, lastAttack: 0, level: 1 },
      { id: 'e_t2', type: 'tower', owner: 'enemy', name: 'Kule 2', x: ARENA_WIDTH - 80, y: 120, hp: 1500, maxHp: 1500, damage: 80, speed: 0, range: 100, lastAttack: 0, level: 1 },
    ];
    setEntities(initEntities);

    // Timer logic
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          gameRunningRef.current = false;
          onGameOver('loss', statsRef.current); // Timeout counts as loss for simplicity, or draw.
          return 0;
        }
        return prev - 1;
      });
      // Elixir regen
      setElixir(prev => Math.min(10, prev + 0.3));
      setEnemyElixir(prev => Math.min(10, prev + 0.3));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Game Loop
  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      if (!gameRunningRef.current) return;
      const now = Date.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setEntities(prevEntities => {
        let newEntities = [...prevEntities];
        
        // Move & Attack logic
        newEntities = newEntities.map(entity => {
          if (entity.hp <= 0) return entity; // Dead

          // Find target based on priority: Units > Towers > Main Tower
          let target: Entity | null = null;
          let minDistance = Infinity;
          let currentPriority = -1; // 2 for unit, 1 for tower, 0 for mainTower

          const isHealer = entity.damage < 0;

          prevEntities.forEach(other => {
            const isValidTarget = isHealer 
              ? (other.owner === entity.owner && other.hp > 0 && other.hp < other.maxHp)
              : (other.owner !== entity.owner && other.hp > 0);

            if (isValidTarget) {
              const dx = other.x - entity.x;
              const dy = other.y - entity.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              const priority = other.type === 'unit' ? 2 : other.type === 'tower' ? 1 : 0;

              if (priority > currentPriority) {
                currentPriority = priority;
                minDistance = dist;
                target = other;
              } else if (priority === currentPriority && dist < minDistance) {
                minDistance = dist;
                target = other;
              }
            }
          });

          let newX = entity.x;
          let newY = entity.y;
          let newLastAttack = entity.lastAttack;

          if (target) {
            if (minDistance <= entity.range) {
              // Attack
              if (now - entity.lastAttack > 1000) { // 1 attack per second roughly
                (target as Entity).hp -= entity.damage;
                if ((target as Entity).hp > (target as Entity).maxHp) {
                  (target as Entity).hp = (target as Entity).maxHp;
                }
                newLastAttack = now;
              }
            } else if (entity.speed > 0) {
              // Move towards target
              const dx = (target as Entity).x - entity.x;
              const dy = (target as Entity).y - entity.y;
              const angle = Math.atan2(dy, dx);
              
              newX += Math.cos(angle) * entity.speed * dt;
              newY += Math.sin(angle) * entity.speed * dt;
            }
          } else if (entity.speed > 0) {
            // Move forward if no target
            if (entity.owner === 'player') newY -= entity.speed * dt;
            if (entity.owner === 'enemy') newY += entity.speed * dt;
          }

          // Bounds check
          newX = Math.max(20, Math.min(ARENA_WIDTH - 20, newX));
          newY = Math.max(20, Math.min(ARENA_HEIGHT - 20, newY));

          return { ...entity, x: newX, y: newY, lastAttack: newLastAttack };
        });

        // Filter out dead and update stats
        const finalEntities = newEntities.filter(e => {
          if (e.hp <= 0) {
            if (e.owner === 'enemy') {
              if (e.type === 'unit') statsRef.current.enemiesKilled++;
              if (e.type === 'tower') statsRef.current.towersDestroyed++;
              if (e.type === 'mainTower') {
                statsRef.current.towersDestroyed += 2; // Extra bonus
                gameRunningRef.current = false;
                setTimeout(() => onGameOver('win', statsRef.current), 500);
              }
            } else {
              if (e.type === 'mainTower') {
                gameRunningRef.current = false;
                setTimeout(() => onGameOver('loss', statsRef.current), 500);
              }
            }
            return false;
          }
          return true;
        });

        return finalEntities;
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [onGameOver]);

  // AI Logic (Spawns units)
  useEffect(() => {
    const leagueIndex = LEAGUES.findIndex(l => l.name === league.name);
    // Obsidyen = 3s interval, Ahşap = 8s
    const spawnInterval = 8000 - (leagueIndex * 700); 

    const aiTimer = setInterval(() => {
      if (!gameRunningRef.current) return;
      
      const randomCharDef = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
      
      setEnemyElixir(prev => {
        if (prev >= randomCharDef.cost) {
          const randomX = Math.random() * (ARENA_WIDTH - 60) + 30; // Random X across the width
          spawnUnit('enemy', randomCharDef.id, leagueIndex + 1, randomX, 60); // Enemy level scales with league
          return prev - randomCharDef.cost;
        }
        return prev;
      });

    }, spawnInterval);

    return () => clearInterval(aiTimer);
  }, [league]);

  const spawnUnit = useCallback((owner: 'player' | 'enemy', charId: string, customLevel?: number, x?: number, y?: number) => {
    const charDef = CHARACTERS.find(c => c.id === charId);
    if (!charDef) return;

    let level = 1;
    if (owner === 'player') {
      const pChar = characters.find(c => c.id === charId);
      if (pChar) level = pChar.level;
    } else {
      level = customLevel || 1;
    }

    const hpMultiplier = 1 + (level - 1) * 0.2;
    const damageMultiplier = 1 + (level - 1) * 0.2;

    const spawnX = x !== undefined ? x : (owner === 'player' ? ARENA_WIDTH / 2 : ARENA_WIDTH / 2);
    const spawnY = y !== undefined ? y : (owner === 'player' ? ARENA_HEIGHT - 60 : 60);

    const newUnit: Entity = {
      id: uuidv4(),
      type: 'unit',
      owner,
      name: charDef.name,
      x: spawnX + (Math.random() * 40 - 20), // slight random spread
      y: spawnY,
      hp: charDef.baseHp * hpMultiplier,
      maxHp: charDef.baseHp * hpMultiplier,
      damage: charDef.baseDamage * damageMultiplier,
      speed: charDef.speed,
      range: charDef.range,
      lastAttack: 0,
      level
    };

    setEntities(prev => [...prev, newUnit]);
  }, [characters]);

  return {
    entities,
    timeRemaining,
    elixir,
    spawnUnit,
    setElixir
  };
}
