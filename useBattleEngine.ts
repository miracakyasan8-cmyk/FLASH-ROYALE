import { ArrowLeft, Castle, Shield } from 'lucide-react';
import { AIRSHIP_TYPES, MAIN_TOWER_TYPES } from '../constants';
import { useGameStore } from '../store';

const getTowerStats = (level: number, isMain: boolean) => {
  const baseHp = isMain ? 2500 : 1500;
  const baseDamage = isMain ? 70 : 50;
  const hp = Math.floor(baseHp * Math.pow(isMain ? 1.2 : 1.18, level - 1));
  const damage = Math.floor(baseDamage * Math.pow(1.12, level - 1));
  return { hp, damage };
};

const getAirshipLockdownDuration = (level: number) => Math.min(10, (4400 + (Math.max(1, level) - 1) * 800) / 1000);
const getAirshipBoostDuration = (level: number) => Math.min(10, (4400 + (Math.max(1, level) - 1) * 800) / 1000);
const getAirshipBoostPercent = (level: number) => {
  const legacy = 1.3 + ((Math.max(1, level) - 1) / 7) * 0.7;
  return Math.round((1 + (legacy - 1) * 2 - 1) * 100);
};
const getAirshipHealPercent = (level: number) => Math.round(Math.min(1, 0.65 + ((Math.max(1, level) - 1) / 7) * 0.35) * 100);
const getAirshipReflectDuration = (level: number) => Number((Math.min(10, (4000 + (Math.max(1, level) - 1) * 860) / 1000)).toFixed(1));
const getAirshipShieldHp = (level: number) => {
  const safe = Math.max(1, Math.min(8, Math.floor(level)));
  return Math.round(1500 + ((safe - 1) / 7) * 3500);
};

export default function Towers({ goBack }: { goBack: () => void }) {
  const {
    gold,
    towerLevels,
    ownedMainTowerTypes,
    selectedMainTowerType,
    ownedAirships,
    selectedAirship,
    airshipLevels,
    upgradeTower,
    buyMainTowerType,
    selectMainTowerType,
    buyAirship,
    selectAirship,
    upgradeAirship,
  } = useGameStore();

  const sideLevel = towerLevels.side;
  const mainLevel = towerLevels.main;

  const sideNextCost = sideLevel >= 8 ? null : 500 + (sideLevel - 1) * 250;
  const mainNextCost = mainLevel >= 8 ? null : 1000 + (mainLevel - 1) * 500;

  const sideStats = getTowerStats(sideLevel, false);
  const mainStats = getTowerStats(mainLevel, true);

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-gray-900 p-4">
      <div className="flex items-center mb-6">
        <button onClick={goBack} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700">
          <ArrowLeft size={24} className="text-white" />
        </button>
        <h1 className="ml-4 text-2xl font-bold">GELİŞTİRME MENÜSÜ</h1>
      </div>

      <div className="mb-4 rounded-xl border border-gray-700 bg-gray-800 p-3">
        <p className="text-sm text-gray-300">
          Kulelerini altınla kalıcı olarak yükselt. Bot kuleleri lige göre otomatik güçlenir, oyuncu kuleleri sadece burada gelişir.
        </p>
        <p className="mt-2 text-sm text-yellow-300">Altın: {gold}</p>
      </div>

      <div className="space-y-4 overflow-y-auto pb-6">
        <div className="rounded-2xl border border-blue-700/50 bg-blue-900/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={20} className="text-blue-300" />
            <h2 className="font-bold text-lg">Yan Kuleler</h2>
          </div>
          <div className="text-sm text-gray-300 space-y-1">
            <p>Seviye: <span className="font-bold text-white">{sideLevel}</span> / 8</p>
            <p>Can: <span className="font-bold text-rose-300">{sideStats.hp}</span></p>
            <p>Hasar: <span className="font-bold text-orange-300">{sideStats.damage}</span></p>
          </div>
          {sideLevel < 8 ? (
            <button
              onClick={() => upgradeTower('side')}
              disabled={sideNextCost === null || gold < sideNextCost}
              className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-bold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              YÜKSELT ({sideNextCost} Altın)
            </button>
          ) : (
            <p className="mt-3 text-xs text-emerald-300">Maksimum seviye.</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-700/50 bg-amber-900/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Castle size={20} className="text-amber-300" />
            <h2 className="font-bold text-lg">Ana Kule</h2>
          </div>
          <div className="text-sm text-gray-300 space-y-1">
            <p>Seviye: <span className="font-bold text-white">{mainLevel}</span> / 8</p>
            <p>Can: <span className="font-bold text-rose-300">{mainStats.hp}</span></p>
            <p>Hasar: <span className="font-bold text-orange-300">{mainStats.damage}</span></p>
          </div>
          {mainLevel < 8 ? (
            <button
              onClick={() => upgradeTower('main')}
              disabled={mainNextCost === null || gold < mainNextCost}
              className="mt-3 w-full rounded-lg bg-amber-600 py-2 text-sm font-bold hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              YÜKSELT ({mainNextCost} Altın)
            </button>
          ) : (
            <p className="mt-3 text-xs text-emerald-300">Maksimum seviye.</p>
          )}
        </div>

        <div className="rounded-2xl border border-fuchsia-700/50 bg-fuchsia-900/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-lg">Ana Kule Tipleri</h2>
            <span className="text-xs text-fuchsia-200">Aktif: {MAIN_TOWER_TYPES.find((item) => item.id === selectedMainTowerType)?.name}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {MAIN_TOWER_TYPES.map((towerType) => {
              const owned = ownedMainTowerTypes.includes(towerType.id);
              const selected = selectedMainTowerType === towerType.id;
              const canBuy = !owned && gold >= towerType.cost;

              return (
                <div
                  key={towerType.id}
                  className={`rounded-xl border p-3 ${selected ? 'border-fuchsia-300 bg-fuchsia-800/40' : 'border-fuchsia-700/40 bg-fuchsia-950/20'}`}
                >
                  <div className="text-sm font-bold text-white">{towerType.name}</div>
                  <p className="mt-1 text-[11px] leading-snug text-fuchsia-100">{towerType.description}</p>

                  {owned ? (
                    <button
                      onClick={() => selectMainTowerType(towerType.id)}
                      className={`mt-3 w-full rounded-lg py-2 text-xs font-bold ${selected ? 'bg-emerald-600 text-white' : 'bg-fuchsia-700 text-white hover:bg-fuchsia-600'}`}
                    >
                      {selected ? 'SEÇİLİ' : 'SEÇ'}
                    </button>
                  ) : (
                    <button
                      onClick={() => buyMainTowerType(towerType.id)}
                      disabled={!canBuy}
                      className="mt-3 w-full rounded-lg bg-amber-600 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      SATIN AL ({towerType.cost} Altın)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-700/50 bg-cyan-900/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-lg">HAVA SALDIRISI</h2>
            <span className="text-xs text-cyan-100">Aktif: {selectedAirship ? AIRSHIP_TYPES.find((item) => item.id === selectedAirship)?.name ?? '-' : '-'}</span>
          </div>
          <p className="mb-3 text-xs text-cyan-100/80">
            Gemiler savaşta yapılan aksiyonlarla dolar. %100 olunca maç içinde kullanılabilir.
          </p>

          <div className="space-y-3">
            {AIRSHIP_TYPES.map((airship) => {
              const owned = ownedAirships.includes(airship.id);
              const selected = selectedAirship === airship.id;
              const canBuy = !owned && gold >= airship.cost;
              const level = airshipLevels[airship.id] ?? 1;
              const nextUpgradeCost = level >= 8 ? null : 900 + (level - 1) * 450;
              const currentLock = getAirshipLockdownDuration(level);
              const currentBoostDuration = getAirshipBoostDuration(level);
              const currentBoostPercent = getAirshipBoostPercent(level);
              const currentHealPercent = getAirshipHealPercent(level);

              return (
                <div
                  key={airship.id}
                  className={`rounded-xl border p-3 ${selected ? 'border-cyan-300 bg-cyan-800/30' : 'border-cyan-700/40 bg-cyan-950/20'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white">
                      <span className="mr-2">{airship.icon}</span>
                      {airship.name}
                    </div>
                    {selected && <span className="text-[10px] rounded-full bg-cyan-500/30 px-2 py-0.5 text-cyan-100">SEÇİLİ</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-cyan-100/85">{airship.description}</p>
                  <p className="mt-1 text-[11px] text-cyan-200">Seviye: {level}/8</p>
                  <div className="mt-2 rounded-md bg-cyan-950/40 p-2 text-[11px] text-cyan-100">
                    {airship.id === 'lockdown' && (
                      <p>Mevcut Etki: {currentLock.toFixed(1)} sn kilitleme</p>
                    )}
                    {airship.id === 'boost' && (
                      <p>Mevcut Etki: {currentBoostDuration.toFixed(1)} sn +%{currentBoostPercent} hasar/hız</p>
                    )}
                    {airship.id === 'heal' && (
                      <p>Mevcut Etki: Sahadaki dostlara 7 sn boyunca kademeli +%{currentHealPercent} can</p>
                    )}
                    {airship.id === 'reflector' && (
                      <p>Mevcut Etki: {getAirshipReflectDuration(level)} sn boyunca alınan hasarın %50'si yansır</p>
                    )}
                    {airship.id === 'shield' && (
                      <p>Mevcut Etki: Tüm dostlara +{getAirshipShieldHp(level)} kalkan canı</p>
                    )}
                  </div>

                  {owned ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => selectAirship(airship.id)}
                        className={`rounded-lg py-2 text-xs font-bold ${selected ? 'bg-emerald-600 text-white' : 'bg-cyan-700 text-white hover:bg-cyan-600'}`}
                      >
                        {selected ? 'SEÇİLİ' : 'SEÇ'}
                      </button>
                      <button
                        onClick={() => upgradeAirship(airship.id)}
                        disabled={nextUpgradeCost === null || gold < nextUpgradeCost}
                        className="rounded-lg bg-amber-600 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {nextUpgradeCost === null ? 'MAKS' : `YÜKSELT (${nextUpgradeCost})`}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => buyAirship(airship.id)}
                      disabled={!canBuy}
                      className="mt-3 w-full rounded-lg bg-amber-600 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      SATIN AL ({airship.cost} Altın)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
