import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const serviceNoticesTable = pgTable("service_notices", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  title: text("title").notNull(),
  noticeType: text("notice_type").notNull(),
  routeNames: text("route_names")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  message: text("message").notNull(),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const serviceNoticeDeliveriesTable = pgTable(
  "service_notice_deliveries",
  {
    id: serial("id").primaryKey(),
    noticeId: integer("notice_id")
      .notNull()
      .references(() => serviceNoticesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    messageId: text("message_id").notNull().unique(),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => ({
    noticeUserUnique: uniqueIndex("service_notice_delivery_user_unique").on(
      table.noticeId,
      table.userId,
    ),
    noticeStatusIdx: index("service_notice_delivery_status_idx").on(
      table.noticeId,
      table.status,
    ),
  }),
);

export type ServiceNotice = typeof serviceNoticesTable.$inferSelect;
export type ServiceNoticeDelivery =
  typeof serviceNoticeDeliveriesTable.$inferSelect;
