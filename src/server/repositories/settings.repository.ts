import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { storeSettings } from "../../db/schema/settings.ts";
import type { StoreSettingKey, StoreSettingsMap } from "../../db/schema/json-types.ts";
import type { DatabaseExecutor } from "./base.repository.ts";

export class SettingsRepository {
  /**
   * Retrieves all key-value entries from the store_settings table.
   */
  async getAllSettings(executor: DatabaseExecutor = db) {
    return executor.select().from(storeSettings);
  }

  /**
   * Retrieves a specific setting by key.
   */
  async getSettingByKey<K extends StoreSettingKey>(
    key: K,
    executor: DatabaseExecutor = db
  ): Promise<StoreSettingsMap[K] | null> {
    const rows = await executor
      .select({ value: storeSettings.value })
      .from(storeSettings)
      .where(eq(storeSettings.key, key))
      .limit(1);

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows[0].value as StoreSettingsMap[K];
  }

  /**
   * Atomically upserts a store setting.
   */
  async upsertSetting<K extends StoreSettingKey>(
    key: K,
    value: StoreSettingsMap[K],
    updatedById?: string,
    executor: DatabaseExecutor = db
  ) {
    const [row] = await executor
      .insert(storeSettings)
      .values({
        key,
        value: value as any,
        updatedBy: updatedById,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: storeSettings.key,
        set: {
          value: value as any,
          updatedBy: updatedById,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  }

  /**
   * Atomically upserts multiple store settings using the provided executor.
   * Does NOT open internal transactions — caller/service owns transaction scope.
   */
  async upsertSettingsBatch(
    entries: Array<{ key: StoreSettingKey; value: any; updatedById?: string }>,
    executor: DatabaseExecutor = db
  ) {
    const updatedRows = [];
    for (const entry of entries) {
      const row = await this.upsertSetting(entry.key, entry.value, entry.updatedById, executor);
      updatedRows.push(row);
    }
    return updatedRows;
  }

  /**
   * Lightweight healthcheck query directly against the PostgreSQL connection.
   */
  async checkDatabaseHealth(executor: DatabaseExecutor = db): Promise<{ healthy: boolean; timestamp: string }> {
    const result = await executor.execute(sql`SELECT NOW() as current_time`);
    const timestamp = result[0]?.current_time ? String(result[0].current_time) : new Date().toISOString();
    return {
      healthy: true,
      timestamp,
    };
  }
}

export const settingsRepository = new SettingsRepository();
