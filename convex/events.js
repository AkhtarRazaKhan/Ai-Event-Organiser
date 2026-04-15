import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * CREATE EVENT
 */
export const createEvent = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: v.string(),
    tags: v.array(v.string()),
    startDate: v.number(),
    endDate: v.number(),
    timezone: v.string(),
    locationType: v.union(v.literal("physical"), v.literal("online")),
    venue: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.string(),
    state: v.optional(v.string()),
    country: v.string(),
    capacity: v.number(),
    ticketType: v.union(v.literal("free"), v.literal("paid")),
    ticketPrice: v.optional(v.number()),
    coverImage: v.optional(v.string()),
    themeColor: v.optional(v.string()),
  },

  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    if (!user) {
      throw new Error("User not authenticated");
    }

    const themeColor = args.themeColor;

    const slug = args.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const eventId = await ctx.db.insert("events", {
      ...args,
      themeColor,
      slug: `${slug}-${Date.now()}`,
      organizerId: user._id,
      organizerName: user.name,
      registrationCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // FIXED: prevent NaN crash
    await ctx.db.patch(user._id, {
      freeEventsCreated: (user.freeEventsCreated ?? 0) + 1,
    });

    return eventId;
  },
});

/**
 * GET EVENT BY SLUG
 */
export const getEventBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * GET MY EVENTS
 */
export const getMyEvents = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    if (!user) {
      throw new Error("User not authenticated");
    }

    return await ctx.db
      .query("events")
      .withIndex("by_organizer", (q) => q.eq("organizerId", user._id))
      .order("desc")
      .collect();
  },
});

/**
 * DELETE EVENT
 */
export const deleteEvent = mutation({
  args: { eventId: v.id("events") },

  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    if (!user) {
      throw new Error("User not authenticated");
    }

    const event = await ctx.db.get(args.eventId);

    if (!event) {
      throw new Error("Event not found");
    }

    if (event.organizerId !== user._id) {
      throw new Error("Not authorized to delete this event");
    }

    const registrations = await ctx.db
      .query("registrations")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    for (const reg of registrations) {
      await ctx.db.delete(reg._id);
    }

    await ctx.db.delete(args.eventId);

    if (event.ticketType === "free") {
      await ctx.db.patch(user._id, {
        freeEventsCreated: Math.max(
          0,
          (user.freeEventsCreated ?? 0) - 1
        ),
      });
    }

    return { success: true };
  },
});
