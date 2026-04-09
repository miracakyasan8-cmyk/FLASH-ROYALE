@import "tailwindcss";

@keyframes emoji-pop-in {
  0% {
    opacity: 0;
    filter: blur(2px);
  }
  40% {
    opacity: 1;
    filter: blur(0);
  }
  100% {
    opacity: 1;
    filter: blur(0);
  }
}

.emoji-pop {
  animation: emoji-pop-in 260ms ease-out;
}

@keyframes countdown-pop {
  0% {
    opacity: 0;
    transform: scale(0.78);
  }
  35% {
    opacity: 1;
    transform: scale(1.06);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes battle-go {
  0% {
    opacity: 0;
    transform: scale(0.88);
    letter-spacing: 0.06em;
  }
  40% {
    opacity: 1;
    transform: scale(1.08);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    letter-spacing: 0.01em;
  }
}

.countdown-pop {
  animation: countdown-pop 320ms ease-out;
}

.battle-go {
  animation: battle-go 440ms ease-out;
}

@keyframes compare-left-move {
  0% {
    left: 12%;
    transform: translateY(-50%) scale(1);
  }
  50% {
    left: 42%;
    transform: translateY(-50%) scale(1.08);
  }
  100% {
    left: 12%;
    transform: translateY(-50%) scale(1);
  }
}

@keyframes compare-right-move {
  0% {
    right: 12%;
    transform: translateY(-50%) scale(1);
  }
  50% {
    right: 42%;
    transform: translateY(-50%) scale(1.08);
  }
  100% {
    right: 12%;
    transform: translateY(-50%) scale(1);
  }
}

@keyframes compare-hit-pulse {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.7);
  }
  45% {
    opacity: 0.95;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.15);
  }
}

.compare-fighter-left {
  animation: compare-left-move 1.25s ease-in-out infinite;
}

.compare-fighter-right {
  animation: compare-right-move 1.25s ease-in-out infinite;
}

.compare-hit {
  animation: compare-hit-pulse 1.25s ease-out infinite;
}
