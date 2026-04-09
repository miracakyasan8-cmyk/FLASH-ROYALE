import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { EMOJI_COLLECTION, INITIAL_CHARACTERS, LEAGUES, UPGRADE_COSTS, pickWeightedCharacter } from '../constants';
import { User, Swords, Shield, Scroll, ShoppingBag, X, Settings2, Gift, Vault, Castle, Copy, Smartphone } from 'lucide-react';
import Peer from 'peerjs';
import { playMenuClick, unlockAudio } from '../audio';

const FREE_CHEST_COOLDOWN = 20 * 60 * 60 * 1000;
const ADMIN_UNLOCK_KEY = 'clash-clone-admin-unlocked';

const formatRemainingTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

const getLocalDayKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeAdminCode = (value: string) => value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '');

export default function MainMenu({ setView, setBattleMode, setPeerConn }: any) {
  const {
    lp,
    highestLp,
    tp,
    characters,
    playerName,
    playerId,
    setPlayerName,
    selectedEmojis,
    toggleEmojiSelection,
    addLP,
    addTP,
    addGold,
    addTokens,
    grantCharacterAdmin,
    grantAllCharactersAdmin,
    lastFreeChestClaim,
    setLastFreeChestClaim,
    sfxEnabled,
    sfxVolume,
    setAudioSettings,
    redeemPromoCode,
    usedPromoCodes,
    createLocalBackup,
    restoreSharedBackup,
    dailyStreak,
    dailyStreakLastMatchDay,
    dailyStreakLastClaimDay,
    streakSavers,
    claimDailyStreakReward,
    syncDailyStreak,
    resetAccount,
    claimLeagueTrackReward,
    leagueTrackClaimed,
    quests,
  } = useGameStore();
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVaultPanel, setShowVaultPanel] = useState(false);
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [showBotDifficultyOptions, setShowBotDifficultyOptions] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showLeagueTrackModal, setShowLeagueTrackModal] = useState(false);
  const [opponentId, setOpponentId] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [clockTick, setClockTick] = useState(Date.now());
  const [freeChestOpening, setFreeChestOpening] = useState(false);
  const [freeChestReward, setFreeChestReward] = useState<{
    tp: number;
    gold: number;
    tokenCharName: string;
    tokenAmount: number;
    tokenStored: boolean;
  } | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoCodeMessage, setPromoCodeMessage] = useState('');
  const [sharedBackupCode, setSharedBackupCode] = useState('');
  const [generatedBackupCode, setGeneratedBackupCode] = useState('');
  const [vaultMessage, setVaultMessage] = useState('');
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ADMIN_UNLOCK_KEY) === '1';
  });
  const [adminLpAmount, setAdminLpAmount] = useState('');
  const [adminTpAmount, setAdminTpAmount] = useState('');
  const [adminGoldAmount, setAdminGoldAmount] = useState('');
  const [adminTokenCharId, setAdminTokenCharId] = useState(INITIAL_CHARACTERS[0]?.id ?? '');
  const [adminTokenAmount, setAdminTokenAmount] = useState('');
  const [adminGrantCharId, setAdminGrantCharId] = useState(INITIAL_CHARACTERS[0]?.id ?? '');
  const [adminMessage, setAdminMessage] = useState('');
  const [streakRewardToast, setStreakRewardToast] = useState<{ tp: number; gold: number } | null>(null);
  const [entryWarning, setEntryWarning] = useState('');
  const [streakMessage, setStreakMessage] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [leagueTrackMessage, setLeagueTrackMessage] = useState('');
  const [leagueTrackRewardToast, setLeagueTrackRewardToast] = useState<{ leagueName: string; tp: number; gold: number } | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  
  const currentLeagueIndex = LEAGUES.findIndex((l, i) => lp >= l.minLp && (i === LEAGUES.length - 1 || lp < LEAGUES[i+1].minLp));
  const currentLeague = LEAGUES[currentLeagueIndex];
  const nextLeague = currentLeagueIndex < LEAGUES.length - 1 ? LEAGUES[currentLeagueIndex + 1] : null;
  const freeChestRemainingMs = Math.max(0, lastFreeChestClaim + FREE_CHEST_COOLDOWN - clockTick);
  const canClaimFreeChest = freeChestRemainingMs === 0 && !freeChestOpening;
  const hasClaimableQuest = quests.some((quest) => !quest.completed && quest.progress >= quest.target);
  const hasCharacterUpgradeAvailable = characters.some((char) => {
    if (char.level >= 8) return false;
    const cost = UPGRADE_COSTS.find((entry) => entry.nextLevel === char.level + 1);
    return !!cost && char.tokens >= cost.tokens;
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    syncDailyStreak();
  }, [syncDailyStreak]);

  useEffect(() => {
    // Keep streak logic in sync with calendar day changes while app stays open.
    syncDailyStreak();
  }, [clockTick, syncDailyStreak]);

  useEffect(() => {
    if (showBattleModal) return;
    setNetworkBusy(false);
    setStatusMsg('');
    try {
      peerRef.current?.destroy();
    } catch {
      // Ignore close failures when leaving modal.
    }
    peerRef.current = null;
  }, [showBattleModal]);

  useEffect(() => {
    return () => {
      try {
        peerRef.current?.destroy();
      } catch {
        // Ignore destroy failures during unmount.
      }
      peerRef.current = null;
    };
  }, []);

  const handleMenuAction = (fn: () => void) => {
    unlockAudio();
    playMenuClick();
    fn();
  };

  const ensureBattleRequirements = () => {
    const state = useGameStore.getState();
    if (state.selectedCharacters.length !== 4) {
      const message = 'Maça başlamak için Karakterler menüsünden tam 4 karakter seçmelisin.';
      setStatusMsg(message);
      showEntryWarning('KARAKTER EKSİK');
      return false;
    }

    if (state.selectedEmojis.length !== 6) {
      const message = 'Maça başlamak için profilden tam 6 emoji seçmelisin.';
      setStatusMsg(message);
      showEntryWarning(message);
      return false;
    }

    return true;
  };

  const handleStartBot = (difficulty: 'easy' | 'medium' | 'hard') => {
    if (!ensureBattleRequirements()) return;
    handleMenuAction(() => {
      const modeByDifficulty = {
        easy: 'bot_easy',
        medium: 'bot_medium',
        hard: 'bot_hard',
      } as const;
      setBattleMode(modeByDifficulty[difficulty]);
      setView('battle');
    });
  };

  const showEntryWarning = (message: string) => {
    setEntryWarning(message);
    window.setTimeout(() => {
      setEntryWarning((current) => (current === message ? '' : current));
    }, 2200);
  };

  const handleClaimFreeChest = () => {
    if (!canClaimFreeChest || freeChestReward) return;

    handleMenuAction(() => {
      setFreeChestOpening(true);
      setFreeChestReward(null);

      window.setTimeout(() => {
        const tpReward = Math.floor(Math.random() * 61) + 40;
        const goldReward = Math.floor(Math.random() * 201) + 100;
        const tokenCharacter = pickWeightedCharacter();
        const tokenAmount = Math.floor(Math.random() * 5) + 2;
        const tokenStored = lp < tokenCharacter.reqLp;

        addTP(tpReward);
        addGold(goldReward);
        addTokens(tokenCharacter.id, tokenAmount);
        setLastFreeChestClaim(Date.now());

        setFreeChestOpening(false);
        setFreeChestReward({
          tp: tpReward,
          gold: goldReward,
          tokenCharName: tokenCharacter.name,
          tokenAmount,
          tokenStored,
        });
      }, 1400);
    });
  };

  const handleHost = async () => {
    if (!ensureBattleRequirements()) return;
    if (networkBusy) return;
    setNetworkBusy(true);
    setStatusMsg('Bağlantı bekleniyor...');
    const peer = new Peer(`clashclone-local-${playerId}`);
    peerRef.current = peer;
    
    peer.on('open', () => {
      setStatusMsg(`ID: ${playerId} ile bekleniyor. Arkadaşın bu ID'yi girmeli.`);
    });
    
    peer.on('connection', (conn) => {
      setStatusMsg('Bağlandı! Oyun başlıyor...');
      setTimeout(() => {
        setNetworkBusy(false);
        setPeerConn(conn);
        setBattleMode('p2p_host');
        setView('battle');
      }, 1000);
    });

    peer.on('error', (err) => {
      setNetworkBusy(false);
      setStatusMsg('Hata oluştu: ' + err.message);
    });
  };

  const handleJoin = async () => {
    if (!ensureBattleRequirements()) return;
    if (networkBusy) return;
    const cleanedId = opponentId.trim();
    if (!cleanedId) {
      setStatusMsg('Rakip ID boş olamaz.');
      return;
    }
    if (cleanedId === playerId) {
      setStatusMsg('Kendi ID numaranla bağlanamazsın.');
      return;
    }
    setNetworkBusy(true);
    setStatusMsg('Bağlanılıyor...');
    const peer = new Peer();
    peerRef.current = peer;
    
    peer.on('open', () => {
      const conn = peer.connect(`clashclone-local-${cleanedId}`);
      conn.on('open', () => {
        setStatusMsg('Bağlandı! Oyun başlıyor...');
        setTimeout(() => {
          setNetworkBusy(false);
          setPeerConn(conn);
          setBattleMode('p2p_client');
          setView('battle');
        }, 1000);
      });
      conn.on('error', () => {
        setNetworkBusy(false);
        setStatusMsg('Bağlantı başarısız.');
      });
    });

    peer.on('error', (err) => {
      setNetworkBusy(false);
      setStatusMsg('Bağlantı hatası: ' + err.message);
    });
  };

  const handlePromoCodeRedeem = () => {
    handleMenuAction(() => {
      const result = redeemPromoCode(promoCodeInput);
      setPromoCodeMessage(result.message);
      if (result.ok) {
        setPromoCodeInput('');
      }
    });
  };

  const handleResetAccountConfirm = () => {
    handleMenuAction(() => {
      resetAccount();
      setShowResetConfirm(false);
      setShowSettings(false);
      setStatusMsg('Hesap sıfırlandı.');
    });
  };

  const handleUnlockAdminPanel = () => {
    handleMenuAction(() => {
      const code = normalizeAdminCode(adminCodeInput);
      const validCodes = ['mırogamesofficaltm', 'mirogamesofficaltm'];
      if (validCodes.includes(code)) {
        setAdminUnlocked(true);
        localStorage.setItem(ADMIN_UNLOCK_KEY, '1');
        setAdminMessage('Admin paneli açıldı.');
        return;
      }
      setAdminMessage('Kod hatalı.');
    });
  };

  const handleAdminApply = () => {
    handleMenuAction(() => {
      const lpToAdd = Number(adminLpAmount || 0);
      const tpToAdd = Number(adminTpAmount || 0);
      const goldToAdd = Number(adminGoldAmount || 0);

      const safeLp = Number.isFinite(lpToAdd) ? Math.floor(lpToAdd) : 0;
      const safeTp = Number.isFinite(tpToAdd) ? Math.floor(tpToAdd) : 0;
      const safeGold = Number.isFinite(goldToAdd) ? Math.floor(goldToAdd) : 0;

      if (safeLp <= 0 && safeTp <= 0 && safeGold <= 0) {
        setAdminMessage('Eklemek için en az bir değeri 1 veya üstü gir.');
        return;
      }

      if (safeLp > 0) addLP(safeLp);
      if (safeTp > 0) addTP(safeTp);
      if (safeGold > 0) addGold(safeGold);

      setAdminMessage(`Eklendi: ${safeLp > 0 ? `+${safeLp} LP ` : ''}${safeTp > 0 ? `+${safeTp} TP ` : ''}${safeGold > 0 ? `+${safeGold} Altın` : ''}`.trim());
      setAdminLpAmount('');
      setAdminTpAmount('');
      setAdminGoldAmount('');
    });
  };

  const handleAdminAddTokens = () => {
    handleMenuAction(() => {
      const tokenToAdd = Number(adminTokenAmount || 0);
      const safeTokens = Number.isFinite(tokenToAdd) ? Math.floor(tokenToAdd) : 0;
      const target = INITIAL_CHARACTERS.find((c) => c.id === adminTokenCharId);

      if (!target) {
        setAdminMessage('Karakter seçimi geçersiz.');
        return;
      }

      if (safeTokens <= 0) {
        setAdminMessage('Jeton miktarı en az 1 olmalı.');
        return;
      }

      addTokens(adminTokenCharId, safeTokens);
      setAdminTokenAmount('');
      setAdminMessage(`${target.name} için +${safeTokens} jeton eklendi.`);
    });
  };

  const handleAdminAddTokensAll = () => {
    handleMenuAction(() => {
      const tokenToAdd = Number(adminTokenAmount || 0);
      const safeTokens = Number.isFinite(tokenToAdd) ? Math.floor(tokenToAdd) : 0;

      if (safeTokens <= 0) {
        setAdminMessage('Tüm karakterlere vermek için jeton miktarı en az 1 olmalı.');
        return;
      }

      INITIAL_CHARACTERS.forEach((char) => {
        addTokens(char.id, safeTokens);
      });

      setAdminTokenAmount('');
      setAdminMessage(`Tüm karakterlere +${safeTokens} jeton eklendi.`);
    });
  };

  const handleAdminGrantCharacter = () => {
    handleMenuAction(() => {
      const result = grantCharacterAdmin(adminGrantCharId);
      setAdminMessage(result.message);
    });
  };

  const handleAdminGrantAllCharacters = () => {
    handleMenuAction(() => {
      const result = grantAllCharactersAdmin();
      setAdminMessage(result.message);
    });
  };

  const handleCreateBackup = async () => {
    handleMenuAction(() => {
      setVaultMessage('Kaydediliyor...');
    });

    const result = await createLocalBackup();
    setVaultMessage(result.message);
    if (result.ok) {
      const code = result.code ?? '';
      setGeneratedBackupCode(code);
      if (code) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(code);
            setVaultMessage('Taşıma kodu oluşturuldu ve otomatik kopyalandı.');
          }
        } catch {
          // Auto-copy can fail on some mobile browsers; manual copy remains available.
        }
      }
    }
  };

  const handleUnifiedRestore = async () => {
    handleMenuAction(() => {
      setVaultMessage('Kod çözülüyor...');
    });

    const result = await restoreSharedBackup(sharedBackupCode);

    setVaultMessage(result.message);
    if (result.ok) {
      setSharedBackupCode('');
    }
  };

  const handleCopyBackupCode = async () => {
    if (!generatedBackupCode) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(generatedBackupCode);
      setVaultMessage('Taşıma kodu kopyalandı.');
    } catch {
      try {
        const temp = document.createElement('textarea');
        temp.value = generatedBackupCode;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        const success = document.execCommand('copy');
        document.body.removeChild(temp);
        setVaultMessage(success ? 'Taşıma kodu kopyalandı.' : 'Kopyalama başarısız. Kodu manuel olarak seçip kopyala.');
      } catch {
        setVaultMessage('Kopyalama başarısız. Kodu manuel olarak seçip kopyala.');
      }
    }
  };

  const todayDayKey = getLocalDayKey();
  const canClaimStreakReward = dailyStreakLastMatchDay === todayDayKey && dailyStreakLastClaimDay !== todayDayKey;

  const handleClaimStreakReward = () => {
    handleMenuAction(() => {
      const result = claimDailyStreakReward();
      if (result.ok && typeof result.tp === 'number' && typeof result.gold === 'number') {
        setStreakMessage('');
        setStreakRewardToast({ tp: result.tp, gold: result.gold });
        return;
      }

      setStreakMessage(result.message);
      window.setTimeout(() => {
        setStreakMessage((current) => (current === result.message ? '' : current));
      }, 2200);
    });
  };

  const handleClaimLeagueTrackReward = (leagueIndex: number) => {
    handleMenuAction(() => {
      const result = claimLeagueTrackReward(leagueIndex);
      if (result.ok && typeof result.tp === 'number' && typeof result.gold === 'number') {
        setLeagueTrackMessage('');
        setLeagueTrackRewardToast({
          leagueName: LEAGUES[leagueIndex].name,
          tp: result.tp,
          gold: result.gold,
        });
        return;
      }

      setLeagueTrackMessage(result.message);
      window.setTimeout(() => {
        setLeagueTrackMessage((current) => (current === result.message ? '' : current));
      }, 2200);
    });
  };

  return (
    <div className="flex flex-col h-full items-center p-4 max-w-md mx-auto relative">
      <div className="w-full flex justify-end items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-900/50 px-3 py-1 rounded-full border border-blue-500/30 flex items-center shadow-inner gap-3">
            <div>
              <span className="text-blue-400 font-bold mr-1">TP:</span>
              <span className="text-white font-medium">{tp || 0}</span>
            </div>
            <div className="border-l border-blue-500/30 h-4"></div>
            <div>
              <span className="text-yellow-400 font-bold mr-1">LP:</span>
              <span className="text-white font-medium">{lp}</span>
            </div>
            <div className="border-l border-blue-500/30 h-4"></div>
            <div className="flex items-center gap-1">
              <Smartphone size={14} className="text-cyan-300" />
              <span className="text-cyan-300 font-bold">{streakSavers}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => handleMenuAction(() => setShowSettings(true))}
              className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 shadow-lg transition-transform hover:scale-105 ring-2 ring-indigo-400/80"
              title="Ayarlar"
            >
              <Settings2 size={24} className="text-white" />
            </button>
            <span className="text-[10px] font-bold tracking-wide text-indigo-300">AYARLAR</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => handleMenuAction(() => setShowProfile(true))}
              className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 shadow-lg transition-transform hover:scale-105 ring-2 ring-emerald-400/80"
              title="Profil"
            >
              <User size={24} className="text-white" />
            </button>
            <span className="text-[10px] font-bold tracking-wide text-emerald-300">PROFİL</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => handleMenuAction(() => setShowVaultPanel(true))}
              className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 shadow-lg transition-transform hover:scale-105 ring-2 ring-cyan-400/80"
              title="Oyun kayıt sistemi"
            >
              <Vault size={24} className="text-cyan-200" />
            </button>
            <span className="text-[10px] font-bold tracking-wide text-cyan-300">KAYIT</span>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col justify-center gap-4">
        <div className="w-full rounded-xl border border-orange-500/40 bg-gradient-to-r from-gray-800 via-gray-800 to-gray-700 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-orange-300">🔥 Günlük Seri</div>
              <div className="text-lg font-extrabold text-white">{dailyStreak}</div>
            </div>
            <button
              onClick={handleClaimStreakReward}
              disabled={!canClaimStreakReward}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                canClaimStreakReward
                  ? 'bg-orange-500 text-white hover:bg-orange-400'
                  : 'bg-gray-700 text-gray-300 cursor-not-allowed'
              }`}
            >
              ÖDÜLÜ AL
            </button>
          </div>
          <div className="mt-2 text-[11px] text-gray-300">
            00.00-23.59 arası maç oyna, serin artsın. Gün atlanırsa seri sıfırlanır.
          </div>
          {streakMessage && <div className="mt-2 text-xs text-orange-200">{streakMessage}</div>}
        </div>

        <button
          onClick={() => handleMenuAction(() => setShowLeagueTrackModal(true))}
          className="relative bg-gray-800 p-6 rounded-xl flex justify-between items-center shadow-md border-2 w-full mb-2 bg-gradient-to-r from-gray-800 to-gray-700 transition-colors border-red-800/70 hover:border-red-600/80"
        >
          <div className="flex flex-col flex-1 items-center justify-center text-center">
            <span className="text-3xl font-bold text-yellow-400 mb-1">{currentLeague.name} Ligi</span>
            <div className="text-sm text-gray-300 bg-gray-900/50 px-3 py-1 rounded-full border border-gray-600">
              {lp} LP {nextLeague && `/ Sonraki: ${nextLeague.minLp} LP`}
            </div>
            <div className="mt-2 text-[11px] text-red-200/90">
              Lig yolunu açmak için dokun
            </div>
          </div>
        </button>

        <button
          onClick={handleClaimFreeChest}
          disabled={!canClaimFreeChest || !!freeChestReward}
          className={`w-full rounded-xl border p-4 text-left transition-colors ${
            canClaimFreeChest && !freeChestReward
              ? 'border-emerald-400 bg-emerald-900/35 hover:bg-emerald-900/50'
              : 'border-gray-700 bg-gray-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${canClaimFreeChest && !freeChestReward ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700 text-gray-300'}`}>
              <Gift size={20} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-base">Günlük Hediye Kasası</p>
              <p className="text-sm text-gray-300">Her 20 saatte bir ücretsiz TP + Altın + Jeton.</p>
            </div>
            <div className="text-sm font-bold text-right">
              {canClaimFreeChest && !freeChestReward ? (
                <span className="text-emerald-300">HEMEN AÇ</span>
              ) : (
                <span className="text-gray-300">{formatRemainingTime(freeChestRemainingMs)}</span>
              )}
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => {
              unlockAudio();
              playMenuClick();
              if (ensureBattleRequirements()) {
                setStatusMsg('');
                setShowBotDifficultyOptions(false);
                setShowBattleModal(true);
              }
            }} 
            className="flex flex-col items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors p-8 shadow-sm border-2 border-yellow-400/80"
          >
            <Swords size={40} className="mb-2 text-yellow-400" />
            <span className="text-lg font-bold">Savaş</span>
          </button>
          
          <button onClick={() => handleMenuAction(() => setShowProgressModal(true))} className="relative flex flex-col items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors p-8 shadow-sm border-2 border-blue-500/80">
            {hasCharacterUpgradeAvailable && (
              <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-black text-white shadow-lg animate-pulse">
                !
              </span>
            )}
            <Shield size={40} className="mb-2 text-blue-400" />
            <span className="text-lg font-bold">Karakterler</span>
          </button>

          <button
            onClick={() => handleMenuAction(() => setView('quests'))}
            className="relative flex flex-col items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors p-8 shadow-sm border-2 border-emerald-500/80"
          >
            {hasClaimableQuest && (
              <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-black text-white shadow-lg animate-pulse">
                !
              </span>
            )}
            <Scroll size={40} className="mb-2 text-green-400" />
            <span className="text-lg font-bold">Görevler</span>
          </button>

          <button onClick={() => handleMenuAction(() => setView('store'))} className="flex flex-col items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors p-8 shadow-sm border-2 border-purple-500/80">
            <ShoppingBag size={40} className="mb-2 text-purple-400" />
            <span className="text-lg font-bold">Mağaza</span>
          </button>
        </div>

        {entryWarning && (
          <div className="absolute inset-0 z-[55] flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl border border-amber-400/70 bg-black/75 px-8 py-6 text-center shadow-2xl">
              <div className="text-4xl font-black tracking-wide text-amber-300">{entryWarning}</div>
            </div>
          </div>
        )}

        {statusMsg && !showBattleModal && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-200">
            {statusMsg}
          </div>
        )}

      </div>

      {showLeagueTrackModal && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 relative">
            <button onClick={() => setShowLeagueTrackModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold text-center mb-4">LİG YOLU</h2>

            <div className="rounded-xl border border-gray-600 bg-gray-900/70 p-3 max-h-[58vh] overflow-y-auto space-y-2">
              {LEAGUES.slice(1).map((league, offset) => {
                const index = offset + 1;
                const unlocked = highestLp >= league.minLp;
                const claimed = leagueTrackClaimed.includes(index);
                return (
                  <div key={league.name} className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white">{league.name} Ligi</div>
                        <div className="text-[11px] text-gray-300">Gerekli: {league.minLp} LP</div>
                      </div>
                      <button
                        onClick={() => handleClaimLeagueTrackReward(index)}
                        disabled={!unlocked || claimed}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${
                          claimed
                            ? 'bg-emerald-700/70 text-emerald-100 cursor-not-allowed'
                            : unlocked
                              ? 'bg-yellow-600 text-white hover:bg-yellow-500'
                              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {claimed ? 'ALINDI' : 'ÖDÜLÜ AL'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-gray-300 text-center">
              Her lig kendi seviyesine göre farklı ödül verir.
            </div>
            {leagueTrackMessage && (
              <div className="mt-2 text-xs text-yellow-200 bg-yellow-900/20 border border-yellow-800 rounded px-2 py-2 text-center">
                {leagueTrackMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 relative max-h-[88vh] overflow-y-auto">
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6 text-center">Ayarlar</h2>

            <div className="space-y-5">
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Ses Efektleri</span>
                  <button
                    onClick={() => setAudioSettings({ sfxEnabled: !sfxEnabled })}
                    className={`px-3 py-1 rounded text-sm font-bold ${sfxEnabled ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-300'}`}
                  >
                    {sfxEnabled ? 'AÇIK' : 'KAPALI'}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sfxVolume * 100)}
                  onChange={(e) => setAudioSettings({ sfxVolume: Number(e.target.value) / 100 })}
                  className="w-full accent-blue-500"
                />
              </div>

              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">PROMOSYON KODLARI</span>
                  <span className="text-xs text-gray-400">+200 TP</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value)}
                    placeholder="Promosyon kodunu gir"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handlePromoCodeRedeem}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
                  >
                    KULLAN
                  </button>
                </div>

                <div className="mt-2 text-xs text-gray-400">Her kod hesap başına sadece 1 kez kullanılabilir.</div>
                <div className="mt-1 text-xs text-gray-400">Kullanılan kod sayısı: {usedPromoCodes.length}/2</div>
                {promoCodeMessage && (
                  <div className="mt-2 text-xs text-cyan-300 bg-cyan-900/20 border border-cyan-800 rounded px-2 py-1">
                    {promoCodeMessage}
                  </div>
                )}
              </div>

              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">ADMİN PANEL</span>
                  <span className="text-xs text-gray-400">Geliştirici</span>
                </div>

                {!adminUnlocked && (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={adminCodeInput}
                      onChange={(e) => setAdminCodeInput(e.target.value)}
                      placeholder="Admin kodu"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                    <button
                      onClick={handleUnlockAdminPanel}
                      className="w-full px-3 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-bold"
                    >
                      KODU DOĞRULA
                    </button>
                  </div>
                )}

                {adminUnlocked && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        min={0}
                        value={adminLpAmount}
                        onChange={(e) => setAdminLpAmount(e.target.value)}
                        placeholder="LP"
                        className="bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-yellow-500"
                      />
                      <input
                        type="number"
                        min={0}
                        value={adminTpAmount}
                        onChange={(e) => setAdminTpAmount(e.target.value)}
                        placeholder="TP"
                        className="bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        type="number"
                        min={0}
                        value={adminGoldAmount}
                        onChange={(e) => setAdminGoldAmount(e.target.value)}
                        placeholder="Altın"
                        className="bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <button
                      onClick={handleAdminApply}
                      className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-bold"
                    >
                      HESABA EKLE
                    </button>

                    <div className="mt-2 rounded-lg border border-red-800/60 bg-red-950/30 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-red-200">Karaktere Jeton Ver</div>
                        <button
                          onClick={handleAdminAddTokensAll}
                          className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-[10px] font-bold"
                        >
                          HEPSİNE VER
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px]">
                        <select
                          value={adminTokenCharId}
                          onChange={(e) => setAdminTokenCharId(e.target.value)}
                          className="bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-red-500"
                        >
                          {INITIAL_CHARACTERS.map((char) => (
                            <option key={char.id} value={char.id}>
                              {char.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={adminTokenAmount}
                          onChange={(e) => setAdminTokenAmount(e.target.value)}
                          placeholder="Jeton"
                          className="bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <button
                        onClick={handleAdminAddTokens}
                        className="mt-2 w-full px-3 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-bold"
                      >
                        JETON EKLE
                      </button>
                    </div>

                    <div className="mt-2 rounded-lg border border-red-800/60 bg-red-950/30 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-red-200">Karakteri Hesaba Ekle</div>
                        <button
                          onClick={handleAdminGrantAllCharacters}
                          className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-[10px] font-bold"
                        >
                          HEPSİNİ AL
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                        <select
                          value={adminGrantCharId}
                          onChange={(e) => setAdminGrantCharId(e.target.value)}
                          className="bg-gray-950 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-red-500"
                        >
                          {INITIAL_CHARACTERS.map((char) => (
                            <option key={char.id} value={char.id}>
                              {char.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleAdminGrantCharacter}
                          className="px-3 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-bold"
                        >
                          AL
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {adminMessage && (
                  <div className="mt-2 text-xs text-red-200 bg-red-900/20 border border-red-800 rounded px-2 py-1">
                    {adminMessage}
                  </div>
                )}
              </div>

              <div className="bg-red-950/30 border border-red-800/70 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-red-200">Hesabı Sıfırla</div>
                    <div className="text-[11px] text-red-300/80">Tüm ilerleme verileri başlangıca döner.</div>
                  </div>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-600"
                  >
                    HESABI SIFIRLA
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-red-700 bg-gray-900 p-5 text-center">
            <h3 className="text-xl font-extrabold text-red-300">HESAP SIFIRLANSIN MI?</h3>
            <p className="mt-2 text-sm text-gray-300">
              Bu işlem altın, LP, TP, karakterler, kule seviyeleri ve seri verilerini başlangıca döndürür.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-lg bg-gray-700 py-2.5 text-sm font-bold text-gray-100 hover:bg-gray-600"
              >
                İPTAL
              </button>
              <button
                onClick={handleResetAccountConfirm}
                className="rounded-lg bg-red-700 py-2.5 text-sm font-bold text-white hover:bg-red-600"
              >
                SİL
              </button>
            </div>
          </div>
        </div>
      )}

      {showProgressModal && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 relative">
            <button onClick={() => setShowProgressModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold text-center mb-5">Geliştirme Menüsü</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleMenuAction(() => {
                  setShowProgressModal(false);
                  setView('characters');
                })}
                className="rounded-xl border border-blue-700 bg-blue-900/30 p-4 hover:bg-blue-900/50"
              >
                <Shield size={28} className="mx-auto mb-2 text-blue-300" />
                <div className="text-sm font-bold">Karakterler</div>
                <div className="mt-1 text-[11px] text-gray-300">Kartlar, filtreler ve deste setleri</div>
              </button>

              <button
                onClick={() => handleMenuAction(() => {
                  setShowProgressModal(false);
                  setView('towers');
                })}
                className="rounded-xl border border-amber-700 bg-amber-900/30 p-4 hover:bg-amber-900/50"
              >
                <Castle size={28} className="mx-auto mb-2 text-amber-300" />
                <div className="text-sm font-bold">Kuleler</div>
                <div className="mt-1 text-[11px] text-gray-300">Yan kule ve ana kule yükseltmeleri</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 relative">
            <button onClick={() => setShowProfile(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6 text-center">Profil</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Oyuncu Adı</label>
                <input 
                  type="text" 
                  value={playerName} 
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={16}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <div className="text-[11px] text-gray-500 mt-1 text-right">{playerName.length}/16</div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Benzersiz ID</label>
                <div className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-center text-2xl font-mono text-yellow-400 font-bold tracking-widest">
                  {playerId}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gray-400">Savaş Emoji Seti</label>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${selectedEmojis.length === 6 ? 'text-green-300 bg-green-900/40 border border-green-700' : 'text-yellow-300 bg-yellow-900/40 border border-yellow-700'}`}>
                    {selectedEmojis.length} / 6
                  </span>
                </div>
                <div className="grid grid-cols-10 gap-1.5 bg-gray-900 border border-gray-700 rounded-lg p-2 max-h-48 overflow-y-auto">
                  {EMOJI_COLLECTION.map((emoji) => {
                    const isSelected = selectedEmojis.includes(emoji);
                    const isBlocked = !isSelected && selectedEmojis.length >= 6;
                    return (
                      <button
                        key={emoji}
                        onClick={() => toggleEmojiSelection(emoji)}
                        disabled={isBlocked}
                        className={`h-8 w-8 rounded-md text-lg flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-700 ring-1 ring-blue-400' : 'bg-gray-800'} ${isBlocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVaultPanel && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 relative">
            <button onClick={() => setShowVaultPanel(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            <h2 className="text-xl font-bold mb-1 text-center">TAŞIMA KODU KAYIT SİSTEMİ</h2>
            <p className="text-xs text-gray-400 text-center mb-5">
              Hesap ilerlemesi sadece taşıma kodundan yüklenir. Yeni linkte kodu girerek hesabını aynen geri getir.
            </p>

            <div className="space-y-4">
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-3">
                <div className="font-semibold mb-2">Hesabı Güvenceye Al</div>
                <button
                  onClick={handleCreateBackup}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
                >
                  Hesabı Kaydet
                </button>

                {generatedBackupCode && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-300 mb-1 flex items-center justify-between gap-2">
                      <span>Taşıma kodu (yeni link için):</span>
                      <button
                        onClick={handleCopyBackupCode}
                        className="inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-gray-600"
                      >
                        <Copy size={12} /> KOPYALA
                      </button>
                    </div>
                    <div className="w-full overflow-x-auto bg-gray-950 border border-gray-700 rounded px-3 py-2 text-[10px] text-gray-300 whitespace-nowrap select-all">
                      <span>{generatedBackupCode}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-900/70 border border-gray-700 rounded-lg p-3">
                <div className="font-semibold mb-2">Hesabı Geri Yükle</div>
                <div>
                  <div className="text-xs text-gray-300 mb-2">Taşıma kodunu veya hesap bilgili kod metnini buraya yapıştır.</div>
                  <textarea
                    value={sharedBackupCode}
                    onChange={(e) => setSharedBackupCode(e.target.value)}
                    placeholder="Taşıma kodu / hesap kodu"
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full min-h-20 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  onClick={handleUnifiedRestore}
                  disabled={!sharedBackupCode.trim()}
                  className="mt-3 w-full py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-bold disabled:bg-gray-700 disabled:text-gray-400"
                >
                  KABUL ET VE YÜKLE
                </button>
              </div>

              {vaultMessage && (
                <div className="text-xs text-cyan-300 bg-cyan-900/20 border border-cyan-800 rounded px-2 py-2 text-center">
                  {vaultMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showBattleModal && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 relative flex flex-col gap-4">
            <button onClick={() => { setShowBattleModal(false); setShowBotDifficultyOptions(false); setStatusMsg(''); }} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold text-center mb-2">Savaş Modu</h2>

            {!showBotDifficultyOptions && (
              <>
                <button
                  onClick={() => setShowBotDifficultyOptions(true)}
                  className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-xl transition-colors"
                >
                  BOT'A KARŞI
                </button>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-gray-600"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-400">veya</span>
                  <div className="flex-grow border-t border-gray-600"></div>
                </div>

                <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-800 flex flex-col gap-3">
                  <div className="text-center flex flex-col gap-1 text-sm font-medium text-blue-300 bg-blue-900/40 p-2 rounded border border-blue-800/50">
                    <span className="font-bold text-blue-400">NASIL OYNANIR?</span>
                    <span>1. İki cihaz aynı yerel ağa (Wi-Fi) bağlı olmalıdır.</span>
                    <span>2. Bir kişi "ODA KUR" butonuna basıp beklemelidir.</span>
                    <span>3. Diğer kişi, kurucunun Profil'deki "ID"sini girip BAĞLAN demelidir.</span>
                  </div>

                  <button
                    onClick={() => handleMenuAction(handleHost)}
                    disabled={networkBusy}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-colors disabled:bg-gray-700 disabled:text-gray-400"
                  >
                    {networkBusy ? 'BEKLENİYOR...' : 'ODA KUR (BEKLE)'}
                  </button>

                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Rakip ID"
                      value={opponentId}
                      onChange={(e) => setOpponentId(e.target.value)}
                      className="flex-1 w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-center font-mono"
                    />
                    <button
                      onClick={() => handleMenuAction(handleJoin)}
                      disabled={networkBusy}
                      className="px-4 bg-green-600 hover:bg-green-500 rounded-lg font-bold transition-colors disabled:bg-gray-700 disabled:text-gray-400"
                    >
                      BAĞLAN
                    </button>
                  </div>

                  {statusMsg && (
                    <div className="text-center text-sm text-yellow-400 mt-2 p-2 bg-black/40 rounded">
                      {statusMsg}
                    </div>
                  )}
                </div>
              </>
            )}

            {showBotDifficultyOptions && (
              <div className="space-y-3">
                <button
                  onClick={() => handleStartBot('easy')}
                  className="w-full rounded-xl border border-green-600/70 bg-green-900/35 px-4 py-3 text-left hover:bg-green-900/50"
                >
                  <div className="text-lg font-bold text-green-300">Kolay Mod</div>
                  <div className="text-xs text-gray-300">1-3 seviye botlar, rastgele oyun. Ödül: 1x, LP: +3 / -2</div>
                </button>

                <button
                  onClick={() => handleStartBot('medium')}
                  className="w-full rounded-xl border border-yellow-600/70 bg-yellow-900/25 px-4 py-3 text-left hover:bg-yellow-900/40"
                >
                  <div className="text-lg font-bold text-yellow-300">Orta Mod</div>
                  <div className="text-xs text-gray-300">1-5 seviye botlar, daha dengeli oyun. Ödül: 2x, LP: +5 / -4</div>
                </button>

                <button
                  onClick={() => handleStartBot('hard')}
                  className="w-full rounded-xl border border-red-600/70 bg-red-900/25 px-4 py-3 text-left hover:bg-red-900/40"
                >
                  <div className="text-lg font-bold text-red-300">Zor Mod</div>
                  <div className="text-xs text-gray-300">1-8 seviye botlar, daha taktiksel oyun. Ödül: 3x, LP: +8 / -6</div>
                </button>

                <button
                  onClick={() => setShowBotDifficultyOptions(false)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 text-sm font-bold hover:bg-gray-600"
                >
                  GERİ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(freeChestOpening || freeChestReward) && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          {freeChestOpening && (
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-xs p-6 text-center">
              <div className="text-2xl font-extrabold tracking-wide animate-pulse text-white">AÇILIYOR...</div>
              <p className="text-sm text-gray-300 mt-3">Hediye kasası hazırlanıyor.</p>
              <div className="mt-5 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 animate-[pulse_0.8s_ease-in-out_infinite]" />
              </div>
            </div>
          )}

          {!freeChestOpening && freeChestReward && (
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-sm p-6 text-center">
              <h3 className="text-xl font-bold text-white">Günlük Hediye Açıldı</h3>
              <div className="mt-4 space-y-2 text-left bg-gray-900/60 border border-gray-700 rounded-lg p-4">
                <p className="text-cyan-300 font-bold">+{freeChestReward.tp} TP</p>
                <p className="text-yellow-300 font-bold">+{freeChestReward.gold} Altın</p>
                <p className="text-purple-300 font-bold">
                  {freeChestReward.tokenCharName} +{freeChestReward.tokenAmount} Jeton
                </p>
                {freeChestReward.tokenStored && (
                  <p className="text-xs text-gray-300">Karakter kilitli olduğu için jeton envantere kaydedildi.</p>
                )}
              </div>
              <button
                onClick={() => setFreeChestReward(null)}
                className="mt-6 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold"
              >
                TAMAM
              </button>
            </div>
          )}
        </div>
      )}

      {streakRewardToast && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-sm rounded-2xl border border-orange-500/60 bg-gray-800 px-6 py-8 text-center shadow-2xl">
            <p className="text-sm font-semibold text-orange-300 tracking-wide">GÜNLÜK SERİ ÖDÜLÜ</p>
            <h3 className="mt-3 text-3xl font-extrabold text-white animate-pulse">ÖDÜL ALINDI</h3>
            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-left space-y-2">
              <p className="text-cyan-300 font-extrabold text-xl">+{streakRewardToast.tp} TP</p>
              <p className="text-yellow-300 font-extrabold text-xl">+{streakRewardToast.gold} Altın</p>
            </div>
            <button
              onClick={() => setStreakRewardToast(null)}
              className="mt-6 w-full rounded-lg bg-orange-600 py-2.5 text-sm font-bold hover:bg-orange-500"
            >
              TAMAM
            </button>
          </div>
        </div>
      )}

      {leagueTrackRewardToast && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-sm rounded-2xl border border-yellow-500/60 bg-gray-800 px-6 py-8 text-center shadow-2xl">
            <p className="text-sm font-semibold text-yellow-300 tracking-wide">{leagueTrackRewardToast.leagueName} LİGİ ÖDÜLÜ</p>
            <h3 className="mt-3 text-3xl font-extrabold text-white animate-pulse">ÖDÜL ALINDI</h3>
            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-left space-y-2">
              <p className="text-cyan-300 font-extrabold text-xl">+{leagueTrackRewardToast.tp} TP</p>
              <p className="text-yellow-300 font-extrabold text-xl">+{leagueTrackRewardToast.gold} Altın</p>
            </div>
            <button
              onClick={() => setLeagueTrackRewardToast(null)}
              className="mt-6 w-full rounded-lg bg-yellow-600 py-2.5 text-sm font-bold hover:bg-yellow-500"
            >
              TAMAM
            </button>
          </div>
        </div>
      )}
    </div>
  );
}