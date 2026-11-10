import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  routeName: text("route_name"),
  message: text("message").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  userId: text("user_id"),
  status: text("status").notNull().default("open"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => ({
  userIdIdx: index("complaints_user_id_idx").on(table.userId),
}));

export const insertComplaintSchema = createInsertSchema(complaintsTable).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNote: true,
  resolvedAt: true,
});
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type Complaint = typeof complaintsTable.$inferSelect;
