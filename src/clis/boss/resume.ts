/**
 * BOSS直聘 resume — view candidate resume/profile via chat page UI scraping (boss side).
 *
 * Flow: navigate to chat page → click on candidate → scrape the right panel info.
 * The chat page loads candidate basic info, work experience, and education
 * in the right panel when a candidate is selected.
 *
 * HTML structure (right panel):
 *  .base-info-single-detial → name, gender, age, experience, degree
 *  .experience-content.time-list → time ranges (icon-base-info-work / icon-base-info-edu)
 *  .experience-content.detail-list → details (company·position / school·major·degree)
 *  .position-content → job being discussed + expectation
 */
import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

cli({
  site: 'boss',
  name: 'resume',
  description: 'BOSS直聘查看候选人简历（招聘端）',
  domain: 'www.zhipin.com',
  strategy: Strategy.COOKIE,

  browser: true,
  args: [
    { name: 'uid', required: true, help: 'Encrypted UID of the candidate (from chatlist)' },
  ],
  columns: [
    'name', 'gender', 'age', 'experience', 'degree', 'active_time',
    'work_history', 'education',
    'job_chatting', 'expect',
  ],
  func: async (page: IPage | null, kwargs) => {
    if (!page) throw new Error('Browser page required');

    const uid = kwargs.uid;

    // Step 1: Navigate to chat page
    await page.goto('https://www.zhipin.com/web/chat/index');
    await page.wait({ time: 3 });

    // Step 2: Get friend list to find candidate's numeric uid
    const friendData: any = await page.evaluate(`
      async () => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', 'https://www.zhipin.com/wapi/zprelation/friend/getBossFriendListV2.json?page=1&status=0&jobId=0', true);
          xhr.withCredentials = true;
          xhr.timeout = 15000;
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch(e) { reject(e); } };
          xhr.onerror = () => reject(new Error('Network Error'));
          xhr.send();
        });
      }
    `);

    if (friendData.code !== 0) {
      if (friendData.code === 7 || friendData.code === 37) {
        throw new Error('Cookie 已过期！请在当前 Chrome 浏览器中重新登录 BOSS 直聘。');
      }
      throw new Error('获取好友列表失败: ' + (friendData.message || friendData.code));
    }

    let friend: any = null;
    const allFriends = friendData.zpData?.friendList || [];
    friend = allFriends.find((f: any) => f.encryptUid === uid);

    if (!friend) {
      for (let p = 2; p <= 5; p++) {
        const moreUrl = `https://www.zhipin.com/wapi/zprelation/friend/getBossFriendListV2.json?page=${p}&status=0&jobId=0`;
        const moreData: any = await page.evaluate(`
          async () => {
            return new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('GET', '${moreUrl}', true);
              xhr.withCredentials = true;
              xhr.timeout = 15000;
              xhr.setRequestHeader('Accept', 'application/json');
              xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch(e) { reject(e); } };
              xhr.onerror = () => reject(new Error('Network Error'));
              xhr.send();
            });
          }
        `);
        if (moreData.code === 0) {
          const list = moreData.zpData?.friendList || [];
          friend = list.find((f: any) => f.encryptUid === uid);
          if (friend) break;
          if (list.length === 0) break;
        }
      }
    }

    if (!friend) throw new Error('未找到该候选人，请确认 uid 是否正确');

    const numericUid = friend.uid;

    // Step 3: Click on candidate in chat list
    const clicked: any = await page.evaluate(`
      async () => {
        const item = document.querySelector('#_${numericUid}-0') || document.querySelector('[id^="_${numericUid}"]');
        if (item) {
          item.click();
          return { clicked: true };
        }
        const items = document.querySelectorAll('.geek-item');
        for (const el of items) {
          if (el.id && el.id.startsWith('_${numericUid}')) {
            el.click();
            return { clicked: true };
          }
        }
        return { clicked: false };
      }
    `);

    if (!clicked.clicked) {
      throw new Error('无法在聊天列表中找到该用户，请确认聊天列表中有此人');
    }

    // Step 4: Wait for right panel to load
    await page.wait({ time: 2 });

    // Step 5: Scrape the right panel
    const resumeInfo: any = await page.evaluate(`
      (() => {
        const container = document.querySelector('.base-info-single-container') || document.querySelector('.base-info-content');
        if (!container) return { error: 'no container found' };

        // === Basic Info ===
        const nameEl = container.querySelector('.base-name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        // Gender
        let gender = '';
        const detailDiv = container.querySelector('.base-info-single-detial');
        if (detailDiv) {
          const uses = detailDiv.querySelectorAll('use');
          for (const u of uses) {
            const href = u.getAttribute('xlink:href') || u.getAttribute('href') || '';
            if (href.includes('icon-men')) { gender = '男'; break; }
            if (href.includes('icon-women')) { gender = '女'; break; }
          }
        }

        // Active time
        const activeEl = container.querySelector('.active-time');
        const activeTime = activeEl ? activeEl.textContent.trim() : '';

        // Age, experience, degree — direct child divs of .base-info-single-detial
        let age = '', experience = '', degree = '';
        if (detailDiv) {
          for (const el of detailDiv.children) {
            if (el.classList.contains('name-contet') || el.classList.contains('high-light-orange') ||
                el.classList.contains('resume-btn-content') || el.classList.contains('label-remark-content') ||
                el.classList.contains('base-info-item')) continue;
            const text = el.textContent.trim();
            if (!text) continue;
            if (text.match(/\\d+岁/)) age = text;
            else if (text.match(/年|经验|应届/)) experience = text;
            else if (['博士', '硕士', '本科', '大专', '高中', '中专', '中技', '初中'].some(d => text.includes(d))) degree = text;
          }
        }

        // === Work & Education ===
        // Structure: two .experience-content divs
        //   1. .time-list → <li> items with icon (work/edu) and time span
        //   2. .detail-list → <li> items with icon (work/edu) and detail text
        // Each <li> has a <use> with xlink:href "#icon-base-info-work" or "#icon-base-info-edu"

        const workTimes = [];
        const eduTimes = [];
        const workDetails = [];
        const eduDetails = [];

        const timeList = container.querySelector('.experience-content.time-list');
        if (timeList) {
          const lis = timeList.querySelectorAll('li');
          for (const li of lis) {
            const useEl = li.querySelector('use');
            const href = useEl ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '') : '';
            const timeSpan = li.querySelector('.time');
            const timeText = timeSpan ? timeSpan.textContent.trim() : li.textContent.trim();
            if (href.includes('base-info-edu')) {
              eduTimes.push(timeText);
            } else {
              workTimes.push(timeText);
            }
          }
        }

        const detailList = container.querySelector('.experience-content.detail-list');
        if (detailList) {
          const lis = detailList.querySelectorAll('li');
          for (const li of lis) {
            const useEl = li.querySelector('use');
            const href = useEl ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '') : '';
            const valueSpan = li.querySelector('.value');
            const valueText = valueSpan ? valueSpan.textContent.trim() : li.textContent.trim();
            if (href.includes('base-info-edu')) {
              eduDetails.push(valueText);
            } else {
              workDetails.push(valueText);
            }
          }
        }

        // Combine times and details
        const workHistory = [];
        for (let i = 0; i < Math.max(workTimes.length, workDetails.length); i++) {
          const parts = [];
          if (workTimes[i]) parts.push(workTimes[i]);
          if (workDetails[i]) parts.push(workDetails[i]);
          if (parts.length) workHistory.push(parts.join('  '));
        }

        const education = [];
        for (let i = 0; i < Math.max(eduTimes.length, eduDetails.length); i++) {
          const parts = [];
          if (eduTimes[i]) parts.push(eduTimes[i]);
          if (eduDetails[i]) parts.push(eduDetails[i]);
          if (parts.length) education.push(parts.join('  '));
        }

        // === Job Chatting & Expect ===
        const positionContent = container.querySelector('.position-content');
        let jobChatting = '', expect = '';
        if (positionContent) {
          const posNameEl = positionContent.querySelector('.position-name');
          if (posNameEl) jobChatting = posNameEl.textContent.trim();

          const expectEl = positionContent.querySelector('.position-item.expect .value');
          if (expectEl) expect = expectEl.textContent.trim();
        }

        return {
          name, gender, age, experience, degree, activeTime,
          workHistory, education,
          jobChatting, expect,
        };
      })()
    `);

    if (resumeInfo.error) {
      throw new Error('无法获取简历面板: ' + resumeInfo.error);
    }

    return [{
      name: resumeInfo.name || friend.name || '',
      gender: resumeInfo.gender || '',
      age: resumeInfo.age || '',
      experience: resumeInfo.experience || '',
      degree: resumeInfo.degree || '',
      active_time: resumeInfo.activeTime || '',
      work_history: (resumeInfo.workHistory || []).join('\\n') || '(未获取到)',
      education: (resumeInfo.education || []).join('\\n') || '(未获取到)',
      job_chatting: resumeInfo.jobChatting || '',
      expect: resumeInfo.expect || '',
    }];
  },
});
