import { useState } from 'react';
import { useGameStore } from '../store';
import { ArrowLeft, ShoppingCart, Lock, Smartphone } from 'lucide-react';
import { INITIAL_CHARACTERS, STAR_DROP_RATES, STAR_WEIGHTS, pickWeightedCharacterForOwned } from '../constants';

export default function Store({ goBack }: { goBack: () => void }) {
  const {
    tp,
    lp,
    gold,
    streakSavers,
    damagePotions,
    speedPotions,
    arrowRainCards,
    fireballCards,
    characters,
    addTP,
    addGold,
    addTokens,
    grantCharacterAdmin,
    buyStreakSaver,
    buyDamagePotion,
    buySpeedPotion,
    buyArrowRainCards,
    buyFireballCards,
  } = useGameStore();
  const [openingChest, setOpeningChest] = useState<'gold' | 'character' | 'token' | null>(null);
  const [rewardView, setRewardView] = useState<{ title: string; detail: string; colorClass: string } | null>(null);
  const [damageBuyCountInput, setDamageBuyCountInput] = useState<string>('1');
  const [speedBuyCountInput, setSpeedBuyCountInput] = useState<string>('1');
  const [arrowBuyCountInput, setArrowBuyCountInput] = useState<string>('1');
  const [fireballBuyCountInput, setFireballBuyCountInput] = useState<string>('1');

  const sanitizeBuyCountInput = (value: string) => {
    if (value === '') return '';
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '0';
    return String(Math.max(0, Math.min(999, Math.floor(parsed))));
  };

  const toBuyCount = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(999, Math.floor(parsed)));
  };

  const damageBuyCount = toBuyCount(damageBuyCountInput);
  const speedBuyCount = toBuyCount(speedBuyCountInput);
  const arrowBuyCount = toBuyCount(arrowBuyCountInput);
  const fireballBuyCount = toBuyCount(fireballBuyCountInput);

  const openRewardView = (title: string, detail: string, colorClass: string) => {
    setRewardView({ title, detail, colorClass });
  };

  const ownedIds = new Set(characters.map((char) => char.id));
  const eligibleLockedCharacters = INITIAL_CHARACTERS.filter(
    (charDef) => charDef.reqLp <= lp && !ownedIds.has(charDef.id)
  );

  const pickLockedCharacterByRarity = () => {
    if (eligibleLockedCharacters.length === 0) return null;

    const starRoll = Math.random() * 100;
    let acc = 0;
    let targetStars = 1;
    for (const item of STAR_DROP_RATES) {
      acc += item.chance;
      if (starRoll <= acc) {
        targetStars = item.stars;
        break;
      }
    }

    const directPool = eligibleLockedCharacters.filter((charDef) => charDef.stars === targetStars);
    if (directPool.length > 0) {
      return directPool[Math.floor(Math.random() * directPool.length)];
    }

    const weightedPool = eligibleLockedCharacters.map((charDef) => ({
      charDef,
      weight: STAR_WEIGHTS[charDef.stars] ?? 1,
    }));
    const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
    let fallbackRoll = Math.random() * totalWeight;
    for (const item of weightedPool) {
      fallbackRoll -= item.weight;
      if (fallbackRoll <= 0) return item.charDef;
    }

    return weightedPool[weightedPool.length - 1].charDef;
  };

  const buyCharacter = () => {
    if (tp < 1000 || openingChest || eligibleLockedCharacters.length === 0) return;

    addTP(-1000);
    setOpeningChest('character');
    setRewardView(null);

    window.setTimeout(() => {
      const unlockedChar = pickLockedCharacterByRarity();

      if (!unlockedChar) {
        setOpeningChest(null);
        openRewardView('Karakter Kasası', 'Açılabilir karakter yok.', 'text-gray-200');
        return;
      }

      grantCharacterAdmin(unlockedChar.id);
      setOpeningChest(null);
      openRewardView('Karakter Kasası Açıldı', `${unlockedChar.name} açıldı!`, 'text-fuchsia-300');
    }, 1500);
  };

  const buyGold = () => {
    if (tp < 100 || openingChest) return;

    addTP(-100);
    setOpeningChest('gold');
    setRewardView(null);

    window.setTimeout(() => {
      const goldReward = Math.floor(Math.random() * 201) + 100;
      addGold(goldReward);
      setOpeningChest(null);
      openRewardView('Altın Kasası Açıldı', `+${goldReward} Altın`, 'text-yellow-300');
    }, 1200);
  };

  const buyTokens = () => {
    if (tp < 200 || openingChest) return;

    addTP(-200);
    setOpeningChest('token');
    setRewardView(null);

    window.setTimeout(() => {
      const isAllCharactersMaxLevel = INITIAL_CHARACTERS.every((charDef) => {
        const owned = characters.find((char) => char.id === charDef.id);
        return !!owned && owned.level >= 8;
      });

      if (isAllCharactersMaxLevel) {
        const fallbackGoldReward = Math.floor(Math.random() * 201) + 100;
        addGold(fallbackGoldReward);
        setOpeningChest(null);
        openRewardView('Jeton Kasası Açıldı', `Tüm karakterler maksimum seviyede. +${fallbackGoldReward} Altın`, 'text-yellow-300');
        return;
      }

      const randomChar = pickWeightedCharacterForOwned(characters.map((char) => char.id));
      const amount = Math.floor(Math.random() * 7) + 2;
      addTokens(randomChar.id, amount);
      setOpeningChest(null);
      const lockedInfo = lp < randomChar.reqLp ? ' (Kilitli karakter, envantere eklendi)' : '';
      openRewardView('Jeton Kasası Açıldı', `${randomChar.name} +${amount} Jeton${lockedInfo}`, 'text-purple-300');
    }, 1400);
  };

  const buyStreakSaverDevice = () => {
    if (openingChest) return;
    const result = buyStreakSaver();
    if (result.ok) {
      openRewardView('Seri Kurtarma Cihazı', '+1 Cihaz envantere eklendi', 'text-cyan-300');
    } else {
      openRewardView('Satın Alma Başarısız', result.message, 'text-red-300');
    }
  };

  const buyDamagePotionPack = () => {
    if (openingChest) return;
    const result = buyDamagePotion(damageBuyCount);
    if (result.ok) {
      openRewardView('Hasar İksiri', result.message, 'text-red-300');
    } else {
      openRewardView('Satın Alma Başarısız', result.message, 'text-red-300');
    }
  };

  const buySpeedPotionPack = () => {
    if (openingChest) return;
    const result = buySpeedPotion(speedBuyCount);
    if (result.ok) {
      openRewardView('Hız İksiri', result.message, 'text-sky-300');
    } else {
      openRewardView('Satın Alma Başarısız', result.message, 'text-red-300');
    }
  };

  const buyArrowRainPack = () => {
    if (openingChest) return;
    const result = buyArrowRainCards(arrowBuyCount);
    if (result.ok) {
      openRewardView('Ok Yağmuru', result.message, 'text-amber-300');
    } else {
      openRewardView('Satın Alma Başarısız', result.message, 'text-red-300');
    }
  };

  const buyFireballPack = () => {
    if (openingChest) return;
    const result = buyFireballCards(fireballBuyCount);
    if (result.ok) {
      openRewardView('Ateş Topu', result.message, 'text-orange-300');
    } else {
      openRewardView('Satın Alma Başarısız', result.message, 'text-red-300');
    }
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-gray-900 p-4 overflow-y-auto">
      <div className="flex items-center mb-6">
        <button onClick={goBack} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700">
          <ArrowLeft size={24} className="text-white" />
        </button>
        <h1 className="text-2xl font-bold ml-4 flex-1 text-center mr-10">Mağaza</h1>
      </div>

      <div className="flex justify-between items-center mb-8 bg-blue-900/30 border border-blue-800 p-4 rounded-xl">
        <div>
          <div className="text-blue-400 font-bold text-lg">Tecrübe Puanı (TP): <span className="text-blue-300">{tp}</span></div>
          <div className="text-yellow-300 font-bold text-sm mt-1">Altın: {gold}</div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-900/25 px-3 py-2">
          <Smartphone size={16} className="text-cyan-300" />
          <span className="text-cyan-200 text-sm font-bold">{streakSavers}</span>
        </div>
      </div>

      <div className="flex flex-col gap-6 pb-6">
        <div className="bg-gradient-to-br from-yellow-700 to-yellow-900 p-6 rounded-2xl shadow-lg border border-yellow-600 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-yellow-500/20 rounded-full blur-xl"></div>
          <h2 className="text-xl font-bold text-yellow-400 mb-2">Altın Kasası</h2>
          <p className="text-yellow-200/70 text-sm mb-4">Her kasada rastgele 100-300 altın verir. Yükseltme kaynaklarını daha dengeli toplarsın.</p>
          <button 
            onClick={buyGold}
            disabled={tp < 100 || !!openingChest}
            className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${tp >= 100 && !openingChest ? 'bg-yellow-500 hover:bg-yellow-400 text-yellow-900' : 'bg-gray-800 text-gray-500'}`}
          >
            {tp >= 100 && !openingChest ? <ShoppingCart size={20} /> : <Lock size={20} />}
            100 TP ile Aç
          </button>
        </div>

        <div className="bg-gradient-to-br from-fuchsia-700 to-fuchsia-900 p-6 rounded-2xl shadow-lg border border-fuchsia-600 relative overflow-hidden">
          <div className="absolute -left-4 -bottom-4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl"></div>
          <h2 className="text-xl font-bold text-fuchsia-300 mb-2">Karakter Kasası</h2>
          <p className="text-fuchsia-100/80 text-sm mb-3">LP seviyene göre açılabilen yeni karakterlerden birini verir. Yıldız nadirliği oranlıdır.</p>
          <div className="mb-4 rounded-lg border border-fuchsia-400/30 bg-black/20 p-3 text-xs text-fuchsia-100">
            {eligibleLockedCharacters.length > 0 ? (
              <>
                <div className="font-bold text-fuchsia-200 mb-1">Açılabilir Karakter Nadirlik Oranı</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {STAR_DROP_RATES.map((item) => (
                    <div key={item.stars} className="flex items-center justify-between">
                      <span>{item.stars} Yıldız</span>
                      <span className="font-bold">%{item.chance}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-fuchsia-100/80">LP seviyende açılabilir yeni karakter yok. Kasa kilitli.</div>
            )}
          </div>
          <button
            onClick={buyCharacter}
            disabled={tp < 1000 || !!openingChest || eligibleLockedCharacters.length === 0}
            className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${tp >= 1000 && !openingChest && eligibleLockedCharacters.length > 0 ? 'bg-fuchsia-400 hover:bg-fuchsia-300 text-fuchsia-950' : 'bg-gray-800 text-gray-500'}`}
          >
            {tp >= 1000 && !openingChest && eligibleLockedCharacters.length > 0 ? <ShoppingCart size={20} /> : <Lock size={20} />}
            {eligibleLockedCharacters.length > 0 ? '1000 TP ile Aç' : 'Kilitli'}
          </button>
        </div>

        <div className="bg-gradient-to-br from-purple-700 to-purple-900 p-6 rounded-2xl shadow-lg border border-purple-600 relative overflow-hidden">
          <div className="absolute -left-4 -bottom-4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl"></div>
          <h2 className="text-xl font-bold text-purple-400 mb-2">Jeton Kasası</h2>
          <p className="text-purple-200/70 text-sm mb-3">2-8 jeton verir. Düşük yıldızlı karakterler daha sık, yüksek yıldızlı karakterler daha nadir çıkar.</p>
          <div className="mb-4 rounded-lg border border-purple-400/30 bg-black/20 p-3 text-xs text-purple-100">
            <div className="font-bold text-purple-200 mb-1">Yıldız Jeton Çıkma İhtimali</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {STAR_DROP_RATES.map((item) => (
                <div key={item.stars} className="flex items-center justify-between">
                  <span>{item.stars} Yıldız</span>
                  <span className="font-bold">%{item.chance}</span>
                </div>
              ))}
            </div>
          </div>
          <button 
            onClick={buyTokens}
            disabled={tp < 200 || !!openingChest}
            className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${tp >= 200 && !openingChest ? 'bg-purple-500 hover:bg-purple-400 text-purple-900' : 'bg-gray-800 text-gray-500'}`}
          >
            {tp >= 200 && !openingChest ? <ShoppingCart size={20} /> : <Lock size={20} />}
            200 TP ile Aç
          </button>
        </div>

        <div className="bg-gradient-to-br from-cyan-700 to-cyan-900 p-6 rounded-2xl shadow-lg border border-cyan-600 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-cyan-500/20 rounded-full blur-xl"></div>
          <h2 className="text-xl font-bold text-cyan-300 mb-2 flex items-center gap-2">
            <Smartphone size={20} /> Seri Kurtarma Cihazı
          </h2>
          <p className="text-cyan-100/80 text-sm mb-4">Bir gün oyuna giremezsen, seri sıfırlanmak yerine 1 cihaz harcanır ve seri korunur.</p>
          <button
            onClick={buyStreakSaverDevice}
            disabled={gold < 1000 || !!openingChest}
            className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${gold >= 1000 && !openingChest ? 'bg-cyan-400 hover:bg-cyan-300 text-cyan-950' : 'bg-gray-800 text-gray-500'}`}
          >
            {gold >= 1000 && !openingChest ? <ShoppingCart size={20} /> : <Lock size={20} />}
            1000 Altın ile Al
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3">
            <div className="text-sm font-bold text-red-200">🔥 Hasar İksiri</div>
            <p className="mt-1 text-[11px] text-red-100/80">5 maç boyunca %50 hasar bonusu.</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-red-100/80">
              <span>Stok: {damagePotions}/999</span>
               <span>Adet:</span>
            </div>
            <input
              type="number"
              min={0}
              max={999}
               value={damageBuyCountInput}
               onChange={(event) => {
                 const next = sanitizeBuyCountInput(event.target.value);
                 if (next !== null) setDamageBuyCountInput(next);
               }}
              className="mt-1 w-full rounded-md border border-red-400/30 bg-black/30 px-2 py-1 text-sm text-red-100"
            />
            <button
              onClick={buyDamagePotionPack}
               disabled={damageBuyCount <= 0 || gold < 450 * damageBuyCount || damagePotions + damageBuyCount > 999 || !!openingChest}
               className={`mt-3 w-full rounded-lg py-2 text-xs font-bold ${damageBuyCount > 0 && gold >= 450 * damageBuyCount && damagePotions + damageBuyCount <= 999 && !openingChest ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-gray-800 text-gray-500'}`}
            >
              {450 * damageBuyCount} Altın
            </button>
          </div>

          <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-3">
            <div className="text-sm font-bold text-sky-200">👟 Hız İksiri</div>
            <p className="mt-1 text-[11px] text-sky-100/80">5 maç boyunca %50 hız bonusu.</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-sky-100/80">
              <span>Stok: {speedPotions}/999</span>
               <span>Adet:</span>
            </div>
            <input
              type="number"
              min={0}
              max={999}
               value={speedBuyCountInput}
               onChange={(event) => {
                 const next = sanitizeBuyCountInput(event.target.value);
                 if (next !== null) setSpeedBuyCountInput(next);
               }}
              className="mt-1 w-full rounded-md border border-sky-400/30 bg-black/30 px-2 py-1 text-sm text-sky-100"
            />
            <button
              onClick={buySpeedPotionPack}
               disabled={speedBuyCount <= 0 || gold < 300 * speedBuyCount || speedPotions + speedBuyCount > 999 || !!openingChest}
               className={`mt-3 w-full rounded-lg py-2 text-xs font-bold ${speedBuyCount > 0 && gold >= 300 * speedBuyCount && speedPotions + speedBuyCount <= 999 && !openingChest ? 'bg-sky-500 text-white hover:bg-sky-400' : 'bg-gray-800 text-gray-500'}`}
            >
              {300 * speedBuyCount} Altın
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
            <div className="text-sm font-bold text-amber-200">🏹 Ok Yağmuru</div>
            <p className="mt-1 text-[11px] text-amber-100/80">Dokunduğun bölgeye kısa gecikmeyle güçlendirilmiş ok yağmuru düşürür.</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-amber-100/80">
              <span>Stok: {arrowRainCards}/999</span>
               <span>Adet:</span>
            </div>
            <input
              type="number"
              min={0}
              max={999}
               value={arrowBuyCountInput}
               onChange={(event) => {
                 const next = sanitizeBuyCountInput(event.target.value);
                 if (next !== null) setArrowBuyCountInput(next);
               }}
              className="mt-1 w-full rounded-md border border-amber-400/30 bg-black/30 px-2 py-1 text-sm text-amber-100"
            />
            <button
              onClick={buyArrowRainPack}
               disabled={arrowBuyCount <= 0 || gold < 10 * arrowBuyCount || arrowRainCards + arrowBuyCount > 999 || !!openingChest}
               className={`mt-3 w-full rounded-lg py-2 text-xs font-bold ${arrowBuyCount > 0 && gold >= 10 * arrowBuyCount && arrowRainCards + arrowBuyCount <= 999 && !openingChest ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-gray-800 text-gray-500'}`}
            >
               {10 * arrowBuyCount} Altın (+{arrowBuyCount})
            </button>
          </div>

          <div className="rounded-xl border border-orange-500/40 bg-orange-950/30 p-3">
            <div className="text-sm font-bold text-orange-200">☄️ Ateş Topu</div>
            <p className="mt-1 text-[11px] text-orange-100/80">Seçili noktaya düşer, güçlü hasar verir ve vurduklarını yakar.</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-orange-100/80">
              <span>Stok: {fireballCards}/999</span>
               <span>Adet:</span>
            </div>
            <input
              type="number"
              min={0}
              max={999}
               value={fireballBuyCountInput}
               onChange={(event) => {
                 const next = sanitizeBuyCountInput(event.target.value);
                 if (next !== null) setFireballBuyCountInput(next);
               }}
              className="mt-1 w-full rounded-md border border-orange-400/30 bg-black/30 px-2 py-1 text-sm text-orange-100"
            />
            <button
              onClick={buyFireballPack}
               disabled={fireballBuyCount <= 0 || gold < 20 * fireballBuyCount || fireballCards + fireballBuyCount > 999 || !!openingChest}
               className={`mt-3 w-full rounded-lg py-2 text-xs font-bold ${fireballBuyCount > 0 && gold >= 20 * fireballBuyCount && fireballCards + fireballBuyCount <= 999 && !openingChest ? 'bg-orange-500 text-white hover:bg-orange-400' : 'bg-gray-800 text-gray-500'}`}
            >
               {20 * fireballBuyCount} Altın (+{fireballBuyCount})
            </button>
          </div>
        </div>
      </div>

      {(openingChest || rewardView) && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          {openingChest && (
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-xs p-6 text-center">
              <div className="text-2xl font-extrabold tracking-wide animate-pulse text-white">AÇILIYOR...</div>
              <p className="text-sm text-gray-300 mt-3">Kasa hazırlanıyor, ödüller hesaplanıyor.</p>
              <div className="mt-5 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${openingChest === 'gold' ? 'bg-yellow-400' : 'bg-purple-400'} animate-[pulse_0.8s_ease-in-out_infinite]`} />
              </div>
            </div>
          )}

          {!openingChest && rewardView && (
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-xs p-6 text-center">
              <h3 className="text-xl font-bold text-white">{rewardView.title}</h3>
              <p className={`text-2xl font-extrabold mt-4 ${rewardView.colorClass}`}>{rewardView.detail}</p>
              <button
                onClick={() => setRewardView(null)}
                className="mt-6 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold"
              >
                TAMAM
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}