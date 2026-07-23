import React, { useEffect, useMemo, useRef, useState } from "react";

const PHASES = {
  READY: {
    label: "GET READY",
    accent: "#F2F4F7",
    duration: 10,
  },
  WRESTLE: {
    label: "WRESTLE",
    accent: "#35E06F",
    duration: 30,
  },
  REST: {
    label: "REST",
    accent: "#FF414D",
    duration: 15,
  },
  CHAMPIONSHIP: {
    label: "CHAMPIONSHIP ROUND",
    accent: "#D4AF37",
    duration: 30,
  },
};

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function Icon({ name }) {
  const commonProps = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2.2,
  };

  if (name === "reset") {
    return (
      <svg {...commonProps}>
        <path d="M4.6 8.2V3.9m0 0h4.3m-4.3 0 2.8 2.8a8 8 0 1 1-1.8 8.6" />
      </svg>
    );
  }

  if (name === "previous") {
    return (
      <svg {...commonProps} fill="currentColor" stroke="none">
        <path d="M5 5.5h2.2v13H5zM19 6.2v11.6c0 .9-1 1.4-1.7.9L8.9 13a1.2 1.2 0 0 1 0-2l8.4-5.7c.7-.5 1.7 0 1.7.9Z" />
      </svg>
    );
  }

  if (name === "next") {
    return (
      <svg {...commonProps} fill="currentColor" stroke="none">
        <path d="M16.8 5.5H19v13h-2.2zM5 6.2v11.6c0 .9 1 1.4 1.7.9l8.4-5.7a1.2 1.2 0 0 0 0-2L6.7 5.3c-.7-.5-1.7 0-1.7.9Z" />
      </svg>
    );
  }

  if (name === "pause") {
    return (
      <svg {...commonProps} fill="currentColor" stroke="none">
        <rect x="5.5" y="4" width="4.6" height="16" rx="1" />
        <rect x="13.9" y="4" width="4.6" height="16" rx="1" />
      </svg>
    );
  }

  if (name === "play") {
    return (
      <svg {...commonProps} fill="currentColor" stroke="none">
        <path d="M7.1 4.9v14.2c0 1 1.1 1.6 2 1l10-7.1c.8-.6.8-1.5 0-2.1l-10-7.1c-.9-.6-2 .1-2 1.1Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4.5 10v4h3.2l4.2 3.7V6.3L7.7 10H4.5Z" fill="currentColor" stroke="none" />
      <path d="M15 9a4.3 4.3 0 0 1 0 6M17.7 6.8a7.4 7.4 0 0 1 0 10.4" />
    </svg>
  );
}

function ControlButton({ label, icon, onClick, primary = false, pressed }) {
  return (
    <button
      className={`timer-control${primary ? " timer-control--primary" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export default function WrestlingWorkoutTimer({
  initialPhase = "READY",
  initialRound = 1,
  totalRounds = 8,
  championshipFinalRound = true,
  onReset,
  onPrevious,
  onNext,
  onPlayStateChange,
  onVolumeToggle,
}) {
  const normalizedInitialPhase = PHASES[initialPhase] ? initialPhase : "READY";
  const [phase, setPhase] = useState(normalizedInitialPhase);
  const [round, setRound] = useState(Math.min(Math.max(initialRound, 1), totalRounds));
  const [secondsRemaining, setSecondsRemaining] = useState(PHASES[normalizedInitialPhase].duration);
  const [isRunning, setIsRunning] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const deadlineRef = useRef(0);

  const isChampionship = championshipFinalRound && phase === "WRESTLE" && round === totalRounds;
  const presentation = useMemo(
    () => (isChampionship ? PHASES.CHAMPIONSHIP : PHASES[phase]),
    [isChampionship, phase],
  );

  useEffect(() => {
    onPlayStateChange?.(isRunning);
  }, [isRunning, onPlayStateChange]);

  useEffect(() => {
    if (!isRunning) return undefined;

    deadlineRef.current = performance.now() + secondsRemaining * 1000;
    const tick = () => {
      const nextValue = Math.max(0, Math.ceil((deadlineRef.current - performance.now()) / 1000));
      setSecondsRemaining(nextValue);
      if (nextValue === 0) setIsRunning(false);
    };

    const intervalId = window.setInterval(tick, 100);
    tick();
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  function loadSegment(nextPhase, nextRound) {
    setPhase(nextPhase);
    setRound(nextRound);
    setSecondsRemaining(PHASES[nextPhase].duration);
    setIsRunning(false);
  }

  function resetTimer() {
    loadSegment("READY", 1);
    onReset?.();
  }

  function goPrevious() {
    if (phase === "REST") {
      loadSegment("WRESTLE", round);
    } else if (phase === "WRESTLE" && round > 1) {
      loadSegment("REST", round - 1);
    } else {
      loadSegment("READY", 1);
    }
    onPrevious?.();
  }

  function goNext() {
    if (phase === "READY") {
      loadSegment("WRESTLE", round);
    } else if (phase === "WRESTLE" && round < totalRounds) {
      loadSegment("REST", round);
    } else if (phase === "REST") {
      loadSegment("WRESTLE", Math.min(round + 1, totalRounds));
    } else {
      setSecondsRemaining(0);
      setIsRunning(false);
    }
    onNext?.();
  }

  function toggleRunning() {
    if (secondsRemaining === 0) {
      setSecondsRemaining(PHASES[phase].duration);
    }
    setIsRunning((currentValue) => !currentValue);
  }

  function toggleVolume() {
    setIsMuted((currentValue) => {
      const nextValue = !currentValue;
      onVolumeToggle?.(nextValue);
      return nextValue;
    });
  }

  return (
    <main className="wrestling-timer" style={{ "--phase-accent": presentation.accent }}>
      <div className="rotate-gate" role="status">
        <span className="rotate-gate__icon" aria-hidden="true">↻</span>
        <strong>ROTATE TO LANDSCAPE</strong>
        <span>This timer only runs in a wide layout.</span>
      </div>

      <span className="timer-brand">WORKOUT TIMER</span>

      <section className="timer-stage" aria-live="polite">
        <div className="timer-readout">
          <p className="timer-phase">{presentation.label}</p>
          <time className="timer-countdown" dateTime={`PT${secondsRemaining}S`}>
            {formatTime(secondsRemaining)}
          </time>
          <p className="timer-round">ROUND {round} OF {totalRounds}</p>
        </div>
      </section>

      <nav className="control-pill" aria-label="Timer controls">
        <ControlButton label="Reset timer" icon="reset" onClick={resetTimer} />
        <ControlButton label="Previous interval" icon="previous" onClick={goPrevious} />
        <ControlButton
          label={isRunning ? "Pause timer" : "Start timer"}
          icon={isRunning ? "pause" : "play"}
          onClick={toggleRunning}
          primary
          pressed={isRunning}
        />
        <ControlButton label="Next interval" icon="next" onClick={goNext} />
        <ControlButton
          label={isMuted ? "Unmute timer" : "Mute timer"}
          icon="volume"
          onClick={toggleVolume}
          pressed={isMuted}
        />
      </nav>
    </main>
  );
}
