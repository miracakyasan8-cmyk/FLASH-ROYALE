import { useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useGameStore } from './store';
import MainMenu from './components/MainMenu';
import Battle from './components/Battle';
import Characters from './components/Characters';
import Towers from './components/Towers';
import Store from './components/Store';
import Quests from './components/Quests';
import { setAudioPreferences, startBackgroundMusic, stopBackgroundMusic } from './audio';

export default function App() {
  const [currentView, setCurrentView] = useState('menu');
  const [battleMode, setBattleMode] = useState<'bot_easy' | 'bot_medium' | 'bot_hard' | 'p2p_host' | 'p2p_client'>('bot_easy');
  const [peerConnection, setPeerConnection] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const checkQuestRefresh = useGameStore(s => s.checkQuestRefresh);
  const syncUnlockedCharactersByLp = useGameStore(s => s.syncUnlockedCharactersByLp);
  const sfxEnabled = useGameStore((s) => s.sfxEnabled);
  const musicEnabled = useGameStore((s) => s.musicEnabled);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const musicVolume = useGameStore((s) => s.musicVolume);
  
  useEffect(() => {
    checkQuestRefresh();
    syncUnlockedCharactersByLp();
  }, [checkQuestRefresh, syncUnlockedCharactersByLp]);

  useEffect(() => {
    setAudioPreferences({ sfxEnabled, musicEnabled, sfxVolume, musicVolume });
    if (musicEnabled) {
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }
  }, [sfxEnabled, musicEnabled, sfxVolume, musicVolume]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement || (document as any).webkitFullscreenElement;
      setIsFullscreen(Boolean(fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      const doc: any = document;
      const root: any = document.documentElement;
      const fullscreenElement = document.fullscreenElement || doc.webkitFullscreenElement;

      if (!fullscreenElement) {
        if (root.requestFullscreen) {
          await root.requestFullscreen();
        } else if (root.webkitRequestFullscreen) {
          root.webkitRequestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    } catch {
      // Fullscreen API can fail on some mobile browsers; ignore gracefully.
    }
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white overflow-hidden font-sans select-none">
      {currentView === 'menu' && <MainMenu setView={setCurrentView} setBattleMode={setBattleMode} setPeerConn={setPeerConnection} />}
      {currentView === 'battle' && <Battle goBack={() => setCurrentView('menu')} mode={battleMode} peerConnection={peerConnection} />}
      {currentView === 'characters' && <Characters goBack={() => setCurrentView('menu')} />}
      {currentView === 'towers' && <Towers goBack={() => setCurrentView('menu')} />}
      {currentView === 'store' && <Store goBack={() => setCurrentView('menu')} />}
      {currentView === 'quests' && <Quests goBack={() => setCurrentView('menu')} />}

      {currentView === 'menu' && (
        <button
          onClick={handleToggleFullscreen}
          className="fixed right-3 bottom-3 z-[120] flex items-center gap-2 rounded-lg border border-white/30 bg-black/60 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm"
          aria-label={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran yap'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {isFullscreen ? 'CIK' : 'TAM EKRAN'}
        </button>
      )}
    </div>
  );
}