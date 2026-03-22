/**
 * CamoufoxBridge — IBrowserFactory that connects to a running Camoufox server
 * via playwright-core's Juggler (Firefox) WebSocket protocol.
 *
 * Uses CamoufoxPool for shared context — ensures LiveSyncService cookies
 * are visible to adapter pages.
 */

import * as CamoufoxPool from './camoufox-pool.js';
import type { IBrowserFactory } from '../runtime.js';
import type { IPage } from '../types.js';
import { CamoufoxPage } from './camoufox-page.js';

export class CamoufoxBridge implements IBrowserFactory {
  async connect(opts?: { timeout?: number; workspace?: string }): Promise<IPage> {
    const wsEndpoint = process.env.OPENCLI_CAMOUFOX_WS ?? 'ws://127.0.0.1:19826';
    const context = await CamoufoxPool.acquire(wsEndpoint, { timeout: opts?.timeout });
    const page = await context.newPage();
    return new CamoufoxPage(page, context);
  }

  async close(): Promise<void> {
    // Release our reference — pool stays alive if other users (LiveSyncService) hold refs
    await CamoufoxPool.release();
  }
}
