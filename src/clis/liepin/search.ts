/**
 * 猎聘 h.liepin.com — 搜索候选人简历 (HR/猎头端)
 *
 * Calls POST api-h.liepin.com/api/com.liepin.searchfront4r.h.search-resumes
 * from the browser page context (credentials: include) with form-encoded body.
 * Requires the X-Fscp-* headers that liepin's gateway expects.
 */
import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

/** City name → liepin dqCode mapping (from frontend React state) */
const CITY_CODES: Record<string, string> = {
  '北京': '010', '上海': '020', '天津': '030', '广州': '050020',
  '深圳': '050090', '苏州': '060080', '杭州': '070020', '南京': '060020',
  '成都': '280020', '武汉': '170020', '西安': '270020', '重庆': '040',
  '长沙': '180020', '郑州': '160020', '青岛': '250070', '大连': '210040',
  '东莞': '050030', '佛山': '050060', '宁波': '070030', '合肥': '130020',
  '福州': '110020', '厦门': '110040', '昆明': '290020', '珠海': '050050',
  '无锡': '060030', '济南': '250020', '哈尔滨': '220020', '沈阳': '210020',
  '石家庄': '240020', '南昌': '150020', '贵阳': '300020', '南宁': '310020',
  '太原': '260020', '海口': '330020', '兰州': '320020', '长春': '200020',
  '乌鲁木齐': '340020', '常州': '060050', '温州': '070060', '嘉兴': '070050',
  '徐州': '060070',
};

const EXP_MAP: Record<string, string> = {
  '应届': '0', '1-3': '03', '1-3年': '03', '3-5': '05', '3-5年': '05',
  '5-10': '10', '5-10年': '10', '10以上': '99', '10年以上': '99',
};

const DEGREE_MAP: Record<string, string> = {
  '大专': '30', '本科': '40', '硕士': '50', 'MBA': '55', '博士': '60',
};

function resolveCity(input: string): string {
  if (!input) return '';
  if (/^\d+$/.test(input)) return input;
  if (CITY_CODES[input]) return CITY_CODES[input];
  for (const [name, code] of Object.entries(CITY_CODES)) {
    if (name.includes(input) || input.includes(name)) return code;
  }
  return input;
}

function resolveMap(input: string | undefined, map: Record<string, string>): string {
  if (!input) return '';
  if (map[input] !== undefined) return map[input];
  for (const [key, val] of Object.entries(map)) {
    if (key.includes(input) || input.includes(key)) return val;
  }
  return input;
}

cli({
  site: 'liepin',
  name: 'search',
  description: '猎聘搜索候选人简历',
  domain: 'h.liepin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', required: true, positional: true, help: '搜索关键词 (职位/技能/公司名)' },
    { name: 'city', default: '', help: '期望城市 (如 北京、上海、深圳)' },
    { name: 'experience', default: '', help: '工作年限: 1-3/3-5/5-10/10以上' },
    { name: 'degree', default: '', help: '学历: 大专/本科/硕士/博士' },
    { name: 'page', type: 'int', default: 0, help: '页码 (从0开始)' },
    { name: 'limit', type: 'int', default: 30, help: '返回数量' },
  ],
  columns: ['name', 'title', 'company', 'experience', 'degree', 'city', 'activity', 'id'],
  func: async (page: IPage | null, kwargs) => {
    if (!page) throw new Error('Browser page required');

    const keyword = kwargs.keyword;
    const limit = kwargs.limit || 30;
    const curPage = kwargs.page || 0;
    const debug = !!(process.env.OPENCLI_VERBOSE || process.env.DEBUG?.includes('opencli'));

    // Navigate to the search page to establish session context
    await page.goto('https://h.liepin.com/search/getConditionItem/');
    await page.wait({ time: 2 });

    // Build the searchParams object matching the frontend's dealSearchDataToAjax()
    const searchParams: Record<string, any> = {
      keyword,
      curPage,
      searchType: 0,
      sortType: '0',
      anyKeyword: '0',
      jobPeriod: '0',
      compPeriod: '0',
      resumetype: '0',
    };

    // City filter: wantDqsOut expects array of {dqCode, dqName}
    if (kwargs.city) {
      const cityCode = resolveCity(kwargs.city);
      searchParams.wantDqsOut = [{ dqCode: cityCode, dqName: kwargs.city }];
    }

    // Experience: workYearsLow
    const expVal = resolveMap(kwargs.experience, EXP_MAP);
    if (expVal) searchParams.workYearsLow = expVal;

    // Degree: eduLevels array
    const degreeVal = resolveMap(kwargs.degree, DEGREE_MAP);
    if (degreeVal) searchParams.eduLevels = [degreeVal];

    if (debug) {
      console.error(`[opencli:liepin] Search params: ${JSON.stringify(searchParams)}`);
    }

    // Call the API from browser context (same-site cookies, CORS allowed)
    const data = await page.evaluate(`
      (() => {
        const xsrfMatch = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
        const xsrfToken = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : '';

        const body = new URLSearchParams();
        body.append('searchParamsInputVo', ${JSON.stringify(JSON.stringify(searchParams))});
        body.append('logForm', '{}');

        return fetch('https://api-h.liepin.com/api/com.liepin.searchfront4r.h.search-resumes', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/plain, */*',
            'X-XSRF-TOKEN': xsrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'X-Client-Type': 'web',
            'X-Fscp-Version': '1.1',
            'X-Fscp-Bi-Stat': JSON.stringify({location: window.location.href}),
            'X-Fscp-Std-Info': JSON.stringify({client_id: '11156'}),
            'X-Fscp-Trace-Id': crypto.randomUUID(),
          },
          body: body.toString(),
        })
        .then(r => r.json())
        .catch(e => ({ flag: 0, msg: e.message }));
      })()
    `);

    if (!data || data.flag !== 1) {
      throw new Error(`猎聘 API 错误: ${data?.msg || JSON.stringify(data)}`);
    }

    if (debug) {
      console.error(`[opencli:liepin] Total results: ${data.data?.totalCnt}`);
    }

    const resList = (data.data?.resList || []).slice(0, limit);
    return resList.map((r: any) => {
      const simple = r.simpleResumeForm || {};
      return {
        name: simple.resName || '',
        title: simple.resTitle || r.wantJobTitle || '',
        company: simple.resCompany || '',
        experience: simple.resWorkyearAge != null ? `${simple.resWorkyearAge}年` : '',
        degree: simple.resEdulevelName || '',
        city: simple.wantDq || r.wantDq || simple.resDqName || '',
        activity: r.activeStatus?.name || '',
        id: simple.resIdEncode || r.usercIdEncode || '',
      };
    });
  },
});
