"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import type { Action } from "@/lib/game/reducer";
import type { GameState } from "@/lib/game/types";

export type SessionRole = "host" | "viewer";

const HEARTBEAT_MS = 5000;

export type GameSync = {
  role: SessionRole | null;
  sessionCode: string | null;
  viewerCount: number;
  sessionError: string | null;
  hasRemoteState: boolean;
  realtimeAvailable: boolean;
  startHosting: () => Promise<void>;
  joinSession: (code: string) => Promise<boolean>;
};

function makeCode(): string {
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
}

function errorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const line = err.message.replace(/^Uncaught Error:\s*/, "").split("\n")[0];
  return line || fallback;
}

const stubSync: GameSync = {
  role: null,
  sessionCode: null,
  viewerCount: 0,
  sessionError: null,
  hasRemoteState: false,
  realtimeAvailable: false,
  startHosting: async () => {},
  joinSession: async () => false,
};

export function useStubGameSync(
  _state: GameState,
  _dispatch: React.Dispatch<Action>,
): GameSync {
  return stubSync;
}

export function useConvexGameSync(
  state: GameState,
  dispatch: React.Dispatch<Action>,
): GameSync {
  const createSession = useMutation(api.sessions.create);
  const publishState = useMutation(api.sessions.publish);
  const joinGame = useMutation(api.sessions.join);
  const heartbeat = useMutation(api.sessions.heartbeat);
  const leaveSession = useMutation(api.sessions.leave);

  const [role, setRole] = useState<SessionRole | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [hasRemoteState, setHasRemoteState] = useState(false);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<Id<"devices"> | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const lastPublished = useRef<string | null>(null);
  const lastHydrated = useRef<string | null>(null);
  const hostingRef = useRef(false);

  const remote = useQuery(
    api.sessions.get,
    sessionCode ? { code: sessionCode } : "skip",
  );

  useEffect(() => {
    if (remote === undefined || !sessionCode) return;
    if (remote === null) {
      if (role === "viewer") setHasRemoteState(false);
      setViewerCount(0);
      return;
    }
    setViewerCount(remote.viewerCount);
    if (role !== "viewer" || remote.stateJson === lastHydrated.current) return;
    lastHydrated.current = remote.stateJson;
    try {
      const next = JSON.parse(remote.stateJson) as GameState;
      dispatch({ type: "HYDRATE_STATE", state: next });
      setHasRemoteState(true);
    } catch {
      setSessionError("Received an unreadable game state.");
    }
  }, [remote, role, sessionCode, dispatch]);

  useEffect(() => {
    if (role !== "host" || !sessionCode || !hostToken) return;
    const json = JSON.stringify(state);
    if (json === lastPublished.current) return;
    lastPublished.current = json;
    void publishState({ code: sessionCode, hostToken, stateJson: json }).catch(
      () => {
        if (lastPublished.current === json) lastPublished.current = null;
      },
    );
  }, [state, role, sessionCode, hostToken, publishState]);

  useEffect(() => {
    if (!deviceId) return;
    const id = window.setInterval(() => {
      void heartbeat({ deviceId });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [deviceId, heartbeat]);

  useEffect(() => {
    if (!deviceId) return;
    const onLeave = () => {
      if (role === "host" && hostToken) {
        void leaveSession({ deviceId, hostToken });
      } else {
        void leaveSession({ deviceId });
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [deviceId, role, hostToken, leaveSession]);

  const startHosting = useCallback(async () => {
    if (hostingRef.current) return;
    hostingRef.current = true;
    const initial = JSON.stringify(stateRef.current);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        const result = await createSession({ code, stateJson: initial });
        lastPublished.current = initial;
        setHostToken(result.hostToken);
        setDeviceId(result.deviceId);
        setSessionCode(result.code);
        setRole("host");
        setSessionError(null);
        return;
      } catch (err) {
        const message = errorMessage(err, "Could not start a session.");
        if (message.includes("Code already in use") && attempt < 4) continue;
        hostingRef.current = false;
        setSessionError(message);
        return;
      }
    }
    hostingRef.current = false;
  }, [createSession]);

  const joinSession = useCallback(
    async (code: string): Promise<boolean> => {
      if (hostingRef.current || role) return false;
      try {
        const result = await joinGame({ code });
        setDeviceId(result.deviceId);
        setSessionCode(code);
        setRole("viewer");
        setSessionError(null);
        return true;
      } catch (err) {
        setSessionError(errorMessage(err, "Could not join the session."));
        return false;
      }
    },
    [joinGame, role],
  );

  return {
    role,
    sessionCode,
    viewerCount,
    sessionError,
    hasRemoteState,
    realtimeAvailable: true,
    startHosting,
    joinSession,
  };
}
