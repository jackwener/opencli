import { cli, Strategy } from '@jackwener/opencli/registry';

async function listSidebarProjects(page) {
    const names = await page.evaluate(`
    (function() {
      const lists = document.querySelectorAll('div[role=list]:not([aria-label])');
      for (const list of lists) {
        const items = list.querySelectorAll(':scope > div[role=listitem][aria-label]');
        if (items.length > 0) {
          return Array.from(items).map(el => el.getAttribute('aria-label'));
        }
      }
      return [];
    })()
  `);
    return Array.isArray(names) ? names : [];
}

async function clickProject(page, name) {
    const clicked = await page.evaluate(`
    (function(target) {
      const lists = document.querySelectorAll('div[role=list]:not([aria-label])');
      for (const list of lists) {
        const items = list.querySelectorAll(':scope > div[role=listitem][aria-label]');
        for (const item of items) {
          if (item.getAttribute('aria-label') === target) {
            const btn = item.querySelector('div[role=button]');
            if (!btn) return false;
            btn.scrollIntoView({block: 'nearest'});
            btn.click();
            return true;
          }
        }
      }
      return false;
    })(${JSON.stringify(name)})
  `);
    if (!clicked) {
        throw new Error(`Failed to click project row: ${name}`);
    }
    await page.wait(0.5);
}

export const newCommand = cli({
    site: 'codex',
    name: 'new',
    description: 'Start a new Codex chat; optionally scope to a specific sidebar project',
    domain: 'localhost',
    strategy: Strategy.UI,
    browser: true,
    args: [
        {
            name: 'project',
            type: 'str',
            required: false,
            valueRequired: true,
            help: 'Exact sidebar project name to switch to before creating the chat (case-sensitive)',
        },
    ],
    columns: ['Status', 'Project'],
    func: async (page, kwargs) => {
        let target = null;
        if (kwargs.project !== undefined) {
            target = kwargs.project.trim();
            if (!target) {
                throw new Error('--project cannot be empty');
            }
        }
        if (target) {
            const available = await listSidebarProjects(page);
            if (!available.includes(target)) {
                const list = available.length
                    ? available.map((n) => `  - ${n}`).join('\n')
                    : '  (none detected — is the sidebar collapsed?)';
                throw new Error(
                    `Project '${target}' not found in Codex sidebar.\nAvailable projects:\n${list}`,
                );
            }
            await clickProject(page, target);
        }
        const isMac = process.platform === 'darwin';
        await page.pressKey(isMac ? 'Meta+N' : 'Control+N');
        await page.wait(1);
        return [{ Status: 'Success', Project: target || '(current)' }];
    },
});
