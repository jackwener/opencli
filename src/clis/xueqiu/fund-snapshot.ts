import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';
import { DANJUAN_DOMAIN, DANJUAN_ASSET_PAGE, fetchDanjuanAll } from './danjuan-utils.js';

cli({
  site: 'xueqiu',
  name: 'fund-snapshot',
  description: '获取蛋卷基金快照（总资产、子账户、持仓，推荐 -f json 输出）',
  domain: DANJUAN_DOMAIN,
  strategy: Strategy.COOKIE,
  navigateBefore: DANJUAN_ASSET_PAGE,
  args: [],
  columns: ['asOf', 'totalAssetAmount', 'totalFundMarketValue', 'accountCount', 'holdingCount'],
  func: async (page: IPage) => {
    const s = await fetchDanjuanAll(page);
    return [{
      asOf: s.asOf,
      totalAssetAmount: s.totalAssetAmount,
      totalAssetDailyGain: s.totalAssetDailyGain,
      totalFundMarketValue: s.totalFundMarketValue,
      accountCount: s.accounts.length,
      holdingCount: s.holdings.length,
      accounts: s.accounts,
      holdings: s.holdings,
    }];
  },
});
