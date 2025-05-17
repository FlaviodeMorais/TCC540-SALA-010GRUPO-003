import { sql } from "drizzle-orm";
import { 
  sqliteTable, 
  integer, 
  real,
  text,
  primaryKey
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tabela de leituras principal (já existente no sistema)
export const readings = sqliteTable("readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  temperature: real("temperature").notNull(),
  level: real("level").notNull(),
  pump_status: integer("pump_status").default(0),
  heater_status: integer("heater_status").default(0),
  timestamp: integer("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

// Nova tabela para agregações de dados históricos
export const historicalData = sqliteTable("historical_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date").notNull(), // timestamp em milissegundos
  period_type: text("period_type").notNull(), // 'hourly', 'daily', 'weekly', 'monthly'
  avg_temperature: real("avg_temperature"),
  min_temperature: real("min_temperature"),
  max_temperature: real("max_temperature"),
  avg_level: real("avg_level"),
  min_level: real("min_level"),
  max_level: real("max_level"),
  pump_on_percentage: real("pump_on_percentage"), // % de tempo que a bomba ficou ligada
  heater_on_percentage: real("heater_on_percentage"), // % de tempo que o aquecedor ficou ligado
  records_count: integer("records_count"), // quantidade de registros na agregação
});

// Tabela para os setpoints de configuração
export const setpoints = sqliteTable("setpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  temp_min: real("temp_min"),
  temp_max: real("temp_max"),
  level_min: real("level_min"),
  level_max: real("level_max"),
  timestamp: integer("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

// Tabela para os settings do sistema
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updated_at: integer("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Tabela para metadados de sincronização
export const syncHistory = sqliteTable("sync_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  start_date: integer("start_date").notNull(), // timestamp em milissegundos
  end_date: integer("end_date").notNull(), // timestamp em milissegundos
  records_synced: integer("records_synced").notNull(),
  status: text("status").notNull(), // 'success', 'failed', 'partial'
  error_message: text("error_message"),
  created_at: integer("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Tabela para registrar eventos importantes do sistema
export const systemEvents = sqliteTable("system_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  event_type: text("event_type").notNull(), // 'error', 'warning', 'info'
  message: text("message").notNull(),
  details: text("details"),
  timestamp: integer("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

// Esquemas Zod para validação e inferência
export const insertReadingSchema = createInsertSchema(readings, {
  temperature: z.number(),
  level: z.number(),
  pump_status: z.number().optional(),
  heater_status: z.number().optional(),
}).omit({ id: true });

export const insertHistoricalDataSchema = createInsertSchema(historicalData, {
  date: z.number(), // timestamp em milissegundos
  period_type: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
  avg_temperature: z.number().optional(),
  min_temperature: z.number().optional(),
  max_temperature: z.number().optional(),
  avg_level: z.number().optional(),
  min_level: z.number().optional(),
  max_level: z.number().optional(),
  pump_on_percentage: z.number().optional(),
  heater_on_percentage: z.number().optional(),
  records_count: z.number().int().positive()
}).omit({ id: true });

export const insertSetpointsSchema = createInsertSchema(setpoints, {
  temp_min: z.number().optional(),
  temp_max: z.number().optional(),
  level_min: z.number().optional(),
  level_max: z.number().optional(),
}).omit({ id: true });

export const insertSettingsSchema = createInsertSchema(settings, {
  key: z.string(),
  value: z.string(),
  description: z.string().optional()
}).omit({ id: true, updated_at: true });

export const insertSyncHistorySchema = createInsertSchema(syncHistory, {
  start_date: z.number(), // timestamp em milissegundos
  end_date: z.number(), // timestamp em milissegundos
  records_synced: z.number().int().nonnegative(),
  status: z.enum(['success', 'failed', 'partial']),
  error_message: z.string().optional()
}).omit({ id: true, created_at: true });

export const insertSystemEventSchema = createInsertSchema(systemEvents, {
  event_type: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  details: z.string().optional()
}).omit({ id: true, timestamp: true });

// Tipos de inserção
export type InsertReading = z.infer<typeof insertReadingSchema>;
export type InsertHistoricalData = z.infer<typeof insertHistoricalDataSchema>;
export type InsertSetpoints = z.infer<typeof insertSetpointsSchema>;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type InsertSyncHistory = z.infer<typeof insertSyncHistorySchema>;
export type InsertSystemEvent = z.infer<typeof insertSystemEventSchema>;

// Tipos de seleção
export type Reading = typeof readings.$inferSelect;
export type HistoricalData = typeof historicalData.$inferSelect;
export type Setpoints = typeof setpoints.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type SyncHistory = typeof syncHistory.$inferSelect;
export type SystemEvent = typeof systemEvents.$inferSelect;