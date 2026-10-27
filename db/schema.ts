import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull().unique(),
  name: text("name").notNull(), role: text("role").notNull(),
  status: text("status").notNull(), createdAt: text("created_at").notNull(),
});
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(), name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(), deletedAt: text("deleted_at"),
});
export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(), kind: text("kind").notNull(),
  name: text("name").notNull(), email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});
export const entityCategories = sqliteTable("entity_categories", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull().references(() => entities.id),
  categoryId: text("category_id").notNull().references(() => categories.id),
});
export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => entities.id),
  targetId: text("target_id").notNull().references(() => entities.id),
  label: text("label").notNull(), notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(), deletedAt: text("deleted_at"),
});
export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  kind: text("kind").notNull().default("Reunião"),
  startsAt: text("starts_at").notNull(), endsAt: text("ends_at"),
  location: text("location").notNull().default(""),
  entityId: text("entity_id").references(() => entities.id),
  status: text("status").notNull().default("Agendado"),
  outcome: text("outcome").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});
export const diaryEntries = sqliteTable("diary_entries", {
  id: text("id").primaryKey(), occurredAt: text("occurred_at").notNull(),
  body: text("body").notNull(), authorEmail: text("author_email").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});
export const diaryMentions = sqliteTable("diary_mentions", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => diaryEntries.id),
  entityId: text("entity_id").notNull().references(() => entities.id),
});

export const usefulPhones = sqliteTable("useful_phones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  phone: text("phone").notNull(),
  extension: text("extension").notNull().default(""),
  city: text("city").notNull().default(""),
  notes: text("notes").notNull().default(""),
  entityId: text("entity_id").references(() => entities.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});
