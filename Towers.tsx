import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { ArrowLeft, CheckCircle, Target } from 'lucide-react';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const formatTimeLeft = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}s ${minutes.toString().padStart(2, '0')}dk`;
};

export default function Quests({ goBack }: { goBack: () => void }) {
  const { quests, claimQuest, lastQuestRefresh, checkQuestRefresh } = useGameStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    checkQuestRefresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      checkQuestRefresh();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [checkQuestRefresh]);

  const timeSinceRefresh = now - lastQuestRefresh;
  const refreshIn = Math.max(0, TWELVE_HOURS - timeSinceRefresh);

  const getDesc = (type: string) => {
    if (type === 'play_time') return 'Savaşlarda saniye geçir';
    if (type === 'destroy_towers') return 'Düşman kulesi yık';
    if (type === 'kill_enemies') return 'Düşman birimi yok et';
    if (type === 'play_matches') return 'Maç oyna';
    if (type === 'win_matches') return 'Maç kazan';
    return '';
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-gray-900 p-4 overflow-y-auto">
      <div className="flex items-center mb-6">
        <button onClick={goBack} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700">
          <ArrowLeft size={24} className="text-white" />
        </button>
        <h1 className="text-2xl font-bold ml-4 flex-1 text-center mr-10">Günlük Görevler</h1>
      </div>

      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800/70 px-4 py-3 text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400">Görev Yenilenmesine Kalan</p>
        <p className="mt-1 text-lg font-bold text-cyan-300">{formatTimeLeft(refreshIn)}</p>
        <p className="mt-1 text-xs text-gray-500">Görevler her 12 saatte bir yerel kayıtla sıfırlanır.</p>
      </div>

      <div className="flex flex-col gap-4 pb-6">
        {quests.map(quest => {
          const isDone = quest.progress >= quest.target;
          return (
            <div key={quest.id} className={`p-4 rounded-xl border ${quest.completed ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-800 border-emerald-600/30'} flex flex-col gap-3`}>
              <div className="flex items-center gap-3">
                <Target className={quest.completed ? 'text-gray-500' : 'text-emerald-500'} />
                <div className="flex-1">
                  <h3 className={`font-bold ${quest.completed ? 'text-gray-500' : 'text-white'}`}>{getDesc(quest.type)}</h3>
                  <div className="text-xs text-gray-400 mt-1 flex justify-between">
                    <span>İlerleme: {Math.floor(quest.progress)} / {quest.target}</span>
                    <span>Ödül: {quest.rewardTP} TP & {quest.rewardGold} 🪙</span>
                  </div>
                </div>
              </div>
              
              <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${quest.completed ? 'bg-gray-600' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }}
                />
              </div>

              {isDone && !quest.completed && (
                <button 
                  onClick={() => claimQuest(quest.id)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white flex justify-center items-center gap-2"
                >
                  <CheckCircle size={18} /> ÖDÜLÜ AL
                </button>
              )}
              {quest.completed && (
                <div className="text-center text-sm font-bold text-gray-500">TAMAMLANDI</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}