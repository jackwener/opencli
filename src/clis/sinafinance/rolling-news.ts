/**
 * Sinafinance rolling news feed
 */

import { cli, Strategy } from '../../registry.js';
import { CliError } from '../../errors.js';
function dateToTimestampParams(dateStr: string): string {
  // 验证日期格式（简单校验）
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // throw new Error('Invalid date format. Expected YYYY-MM-DD.');
    throw new CliError('INPUT_ERROR', `Invalid date format`, 'Expected YYYY-MM-DD.');

  }
  // 创建 Date 对象（注意：new Date('2026-03-24') 在 JS 中默认解析为 UTC 时间的 00:00:00）
  const dt = new Date(dateStr);
  
  // 检查是否是无效日期
  if (isNaN(dt.getTime())) {
    // throw new Error('Invalid date.');
    throw new CliError('INPUT_ERROR', `Invalid date`, 'Expected YYYY-MM-DD.');
  }

  // 获取 stime：当天 00:00:00 UTC 的时间戳（秒）
  const stime = Math.floor(dt.getTime() / 1000);

  // etime：前一天 00:00:00 UTC
  const prevDay = new Date(dt);
  prevDay.setDate(prevDay.getDate() - 1);
  const etime = Math.floor(prevDay.getTime() / 1000);

  // ctime = stime
  const ctime = stime;

  return `&etime=${etime}&stime=${stime}&ctime=${ctime}`;
}
cli({
  site: 'sinafinance',
  name: 'rolling-news',//latest-news
  description: '新浪财经滚动新闻',
  domain: 'finance.sina.com.cn/roll',
  strategy: Strategy.COOKIE,
  args: [
    // { name: 'date', type: 'string', required: false,  help: 'date to search, format as YYYY-MM-dd' },
    // { name: 'page', type: 'string', default: 1, help: 'Number of page' },
    // { name: 'lid', type: 'string', default: 2519, help: 'News type: 2519=财经 2671=股市 2672=美股 2673=中概股 2674=港股 2675=研究报告 2676=全球市场 2487=外汇' },
  ],
  columns: ['clomn', 'title', 'date', 'url'],
  func: async (page, args) => {
    const dateStr = args.date ? dateToTimestampParams(args.date) : '';
    // console.log(`https://finance.sina.com.cn/roll/#pageid=384&lid=${args.lid}&k=&page=${args.page}${dateStr}`)
    await page.goto(
      // `https://finance.sina.com.cn/roll/#pageid=384&lid=${args.lid}&k=&page=${args.page}${dateStr}`,
      `https://finance.sina.com.cn/roll/#pageid=384&lid=2519`,
    );
    await page.wait(5);

    const payload = await page.evaluate(`
      (() => {
        const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
        const results = [];
        document.querySelectorAll('.d_list_txt li').forEach(el => {
          const titleEl = el.querySelector('.c_tit a');
          const clomnEl = el.querySelector('.c_chl');
          const dateEl = el.querySelector('.c_time');
          const url = titleEl?.getAttribute('href') || '';
          if (!url) return;
          results.push({
            title: cleanText(titleEl?.textContent || ''),
            clomn: cleanText(clomnEl?.textContent || ''),
            date: cleanText(dateEl?.textContent || '0'),
            url: url,
          });
        });
        return results;
      })()
    `);
    if (!payload || typeof payload !== 'object') return [];
    const data: any[] = Array.isArray(payload) ? payload : [];
    return data
  },
});
