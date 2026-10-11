import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import {
  ConnectedGameProvider,
  GameProvider,
} from "@/components/game/GameProvider";
import { ScreenRouter } from "@/components/game/ScreenRouter";

export default function Home() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <GameProvider>
        <ScreenRouter />
      </GameProvider>
    );
  }
  return (
    <ConvexClientProvider>
      <ConnectedGameProvider>
        <ScreenRouter />
      </ConnectedGameProvider>
    </ConvexClientProvider>
  );
}
