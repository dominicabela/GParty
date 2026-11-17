"use client";

import { Board } from "./Board";
import { ClueScreen } from "./ClueScreen";
import { DailyDouble } from "./DailyDouble";
import { FinalJeopardy } from "./FinalJeopardy";
import { Generating } from "./Generating";
import { RoundIntro } from "./RoundIntro";
import { Scoreboard } from "./Scoreboard";
import { SessionBadge } from "./SessionBadge";
import { Setup } from "./Setup";
import { Winner } from "./Winner";
import { useGame } from "./GameProvider";

function WaitingForHost() {
  const { sessionCode } = useGame();
  return (
    <div className="board-gradient flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <div className="font-display text-3xl uppercase tracking-widest text-jeopardy-gold-bright sm:text-4xl">
        Connected to game {sessionCode}
      </div>
      <p className="mt-4 animate-pulse text-sm uppercase tracking-[0.3em] text-jeopardy-cream/70">
        Waiting for the host...
      </p>
    </div>
  );
}

export function ScreenRouter() {
  const { state, role, hasRemoteState } = useGame();

  // Viewers wait whenever there's no game to mirror (just joined, or host is back at setup)
  if (role === "viewer" && (!hasRemoteState || state.screen === "setup")) {
    return (
      <div className="flex h-dvh w-screen flex-col bg-jeopardy-blue-darker">
        <div className="relative flex-1 min-h-0">
          <WaitingForHost />
          <SessionBadge />
        </div>
      </div>
    );
  }

  let screen: React.ReactNode;
  switch (state.screen) {
    case "setup":
      screen = <Setup />;
      break;
    case "generating":
      screen = <Generating />;
      break;
    case "intro":
      screen = <RoundIntro />;
      break;
    case "board":
      screen = <Board />;
      break;
    case "clue":
      screen = <ClueScreen />;
      break;
    case "dailyDouble":
      screen = <DailyDouble />;
      break;
    case "final":
      screen = <FinalJeopardy />;
      break;
    case "winner":
      screen = <Winner />;
      break;
    default:
      screen = null;
  }

  const showScoreboard =
    state.screen !== "setup" &&
    state.screen !== "generating" &&
    state.screen !== "winner" &&
    state.screen !== "clue" &&
    state.teams.length > 0;

  return (
    <div className="flex h-dvh w-screen flex-col bg-jeopardy-blue-darker">
      <div className="relative flex-1 min-h-0">
        {screen}
        {state.screen !== "setup" ? <SessionBadge /> : null}
      </div>
      {showScoreboard ? <Scoreboard /> : null}
    </div>
  );
}
