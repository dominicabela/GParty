import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const STALE_MS = 20_000;
const MAX_DEVICES = 6;

const snapshotValidator = v.object({
  stateJson: v.string(),
  viewerCount: v.number(),
});

function assertCode(code: string) {
  if (!/^\d{4}$/.test(code)) {
    throw new Error("Session code must be 4 digits");
  }
}

async function sessionByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("sessions")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

async function devicesForSession(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"sessions">,
) {
  return await ctx.db
    .query("devices")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
}

async function pruneStale(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  now: number,
) {
  const devices = await devicesForSession(ctx, sessionId);
  const live = [];
  for (const device of devices) {
    if (now - device.lastSeen > STALE_MS) {
      await ctx.db.delete("devices", device._id);
    } else {
      live.push(device);
    }
  }
  return live;
}

export const create = mutation({
  args: {
    code: v.string(),
    stateJson: v.string(),
  },
  returns: v.object({
    code: v.string(),
    hostToken: v.string(),
    deviceId: v.id("devices"),
  }),
  handler: async (ctx, args) => {
    assertCode(args.code);
    const existing = await sessionByCode(ctx, args.code);
    if (existing) {
      throw new Error("Code already in use");
    }
    const hostToken = crypto.randomUUID();
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      code: args.code,
      hostToken,
      stateJson: args.stateJson,
    });
    const deviceId = await ctx.db.insert("devices", {
      sessionId,
      role: "host",
      lastSeen: now,
    });
    return { code: args.code, hostToken, deviceId };
  },
});

export const publish = mutation({
  args: {
    code: v.string(),
    hostToken: v.string(),
    stateJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await sessionByCode(ctx, args.code);
    if (!session || session.hostToken !== args.hostToken) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch("sessions", session._id, { stateJson: args.stateJson });
    const now = Date.now();
    const devices = await devicesForSession(ctx, session._id);
    for (const device of devices) {
      if (device.role === "host") {
        await ctx.db.patch("devices", device._id, { lastSeen: now });
      } else if (now - device.lastSeen > STALE_MS) {
        await ctx.db.delete("devices", device._id);
      }
    }
    return null;
  },
});

export const join = mutation({
  args: { code: v.string() },
  returns: v.object({ deviceId: v.id("devices") }),
  handler: async (ctx, args) => {
    assertCode(args.code);
    const session = await sessionByCode(ctx, args.code);
    if (!session) {
      throw new Error("No game found with that code.");
    }
    const now = Date.now();
    const live = await pruneStale(ctx, session._id, now);
    if (live.length >= MAX_DEVICES) {
      throw new Error("This session is full (6 devices max).");
    }
    const deviceId = await ctx.db.insert("devices", {
      sessionId: session._id,
      role: "viewer",
      lastSeen: now,
    });
    return { deviceId };
  },
});

export const heartbeat = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await ctx.db.get("devices", args.deviceId);
    if (!device) return null;
    const now = Date.now();
    await ctx.db.patch("devices", device._id, { lastSeen: now });
    const devices = await devicesForSession(ctx, device.sessionId);
    for (const other of devices) {
      if (other._id === device._id) continue;
      if (now - other.lastSeen > STALE_MS) {
        await ctx.db.delete("devices", other._id);
      }
    }
    return null;
  },
});

export const leave = mutation({
  args: {
    deviceId: v.id("devices"),
    hostToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await ctx.db.get("devices", args.deviceId);
    if (!device) return null;
    if (device.role === "host") {
      const session = await ctx.db.get("sessions", device.sessionId);
      if (!session || session.hostToken !== args.hostToken) {
        throw new Error("Unauthorized");
      }
      const devices = await devicesForSession(ctx, session._id);
      for (const row of devices) {
        await ctx.db.delete("devices", row._id);
      }
      await ctx.db.delete("sessions", session._id);
      return null;
    }
    await ctx.db.delete("devices", device._id);
    return null;
  },
});

export const get = query({
  args: { code: v.string() },
  returns: v.union(snapshotValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await sessionByCode(ctx, args.code);
    if (!session) return null;
    const devices = await devicesForSession(ctx, session._id);
    const viewerCount = devices.filter((device) => device.role === "viewer").length;
    return { stateJson: session.stateJson, viewerCount };
  },
});
