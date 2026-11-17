import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    code: v.string(),
    hostToken: v.string(),
    stateJson: v.string(),
  }).index("by_code", ["code"]),

  devices: defineTable({
    sessionId: v.id("sessions"),
    role: v.union(v.literal("host"), v.literal("viewer")),
    lastSeen: v.number(),
  }).index("by_session", ["sessionId"]),
});
