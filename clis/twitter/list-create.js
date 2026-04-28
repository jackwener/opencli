import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';

cli({
    site: 'twitter',
    name: 'list-create',
    description: 'Create a new Twitter/X list',
    domain: 'x.com',
    strategy: Strategy.UI,
    browser: true,
    args: [
        { name: 'name', positional: true, type: 'string', required: true, help: 'Name of the list' },
        { name: 'description', positional: false, type: 'string', required: false, help: 'Description of the list' },
        { name: 'private', positional: false, type: 'boolean', default: false, help: 'Make list private (default: public)' },
    ],
    columns: ['status', 'listId', 'name', 'description', 'mode', 'message'],
    func: async (page, kwargs) => {
        if (!page)
            throw new CommandExecutionError('Browser session required for twitter list-create');

        const listName = String(kwargs.name || '').trim();
        const listDescription = String(kwargs.description || '').trim();
        const isPrivate = Boolean(kwargs.private);

        if (!listName) {
            throw new CommandExecutionError('List name is required');
        }

        if (listName.length > 100) {
            throw new CommandExecutionError('List name must be 100 characters or less');
        }

        // Navigate to lists management page
        await page.goto('https://x.com/i/lists');
        await page.wait(3);

        // Check if logged in
        const ct0 = await page.evaluate(`() => {
            return document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('ct0='))?.split('=')[1] || null;
        }`);
        if (!ct0) throw new AuthRequiredError('x.com', 'Not logged into x.com (no ct0 cookie)');

        // Use UI to create list
        const createResult = await page.evaluate(`(async () => {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const findOne = (sel, root = document) => root.querySelector(sel);
            const waitFor = async (fn, { timeoutMs = 8000, intervalMs = 200 } = {}) => {
                const t0 = Date.now();
                while (Date.now() - t0 < timeoutMs) {
                    const v = fn();
                    if (v) return v;
                    await sleep(intervalMs);
                }
                return null;
            };

            try {
                // Look for "Create list" button
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                const createBtn = buttons.find(btn =>
                    /create|new list|新建|创建/i.test(btn.innerText || btn.textContent)
                );

                if (!createBtn) {
                    // Try alternative: look for the + button or use URL navigation
                    window.location.href = 'https://x.com/i/lists/create';
                    await sleep(2000);
                    return { ok: false, message: 'Navigated to create list page' };
                }

                createBtn.click();
                await sleep(500);

                // Wait for modal to appear
                const modal = await waitFor(() => document.querySelector('[role="dialog"]'));
                if (!modal) return { ok: false, message: 'Create list modal did not appear' };

                // Find and fill name input
                const nameInput = await waitFor(() => {
                    const inputs = modal.querySelectorAll('input[type="text"]');
                    return Array.from(inputs).find(inp =>
                        inp.placeholder && /name|list name|名称/i.test(inp.placeholder)
                    ) || inputs[0];
                });

                if (!nameInput) return { ok: false, message: 'Could not find name input' };
                nameInput.focus();
                nameInput.value = ${JSON.stringify(listName)};
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(300);

                // Find and fill description input if provided
                if (${JSON.stringify(listDescription)}) {
                    const inputs = modal.querySelectorAll('textarea, input[type="text"]');
                    const descInput = Array.from(inputs).find(inp =>
                        inp.placeholder && /description|描述/i.test(inp.placeholder)
                    );
                    if (descInput) {
                        descInput.focus();
                        descInput.value = ${JSON.stringify(listDescription)};
                        descInput.dispatchEvent(new Event('input', { bubbles: true }));
                        await sleep(300);
                    }
                }

                // Set privacy if needed
                if (${JSON.stringify(isPrivate)}) {
                    const labels = Array.from(modal.querySelectorAll('label, [role="radio"], [role="checkbox"]'));
                    const privateOption = labels.find(el =>
                        /private|私有|隐私/i.test(el.innerText || el.textContent)
                    );
                    if (privateOption) {
                        privateOption.click();
                        await sleep(300);
                    }
                }

                // Find and click Create button
                const createSubmitBtn = await waitFor(() => {
                    const btns = modal.querySelectorAll('button');
                    return Array.from(btns).find(btn =>
                        /^create$|^next$|^create list$/i.test(btn.innerText?.trim() || btn.textContent?.trim())
                    );
                });

                if (!createSubmitBtn) return { ok: false, message: 'Could not find Create button' };
                createSubmitBtn.click();
                await sleep(2000);

                // Check if list was created by looking for success or redirect
                const newUrl = window.location.href;
                const isSuccess = newUrl.includes('/i/lists/') && !newUrl.includes('create');

                return {
                    ok: isSuccess,
                    message: isSuccess ? 'List created successfully' : 'List creation may have failed',
                    url: newUrl
                };
            } catch (e) {
                return { ok: false, message: String(e) };
            }
        })()`);

        if (!createResult.ok) {
            return [{
                status: 'failed',
                listId: '',
                name: listName,
                description: listDescription,
                mode: isPrivate ? 'private' : 'public',
                message: createResult.message || 'Failed to create list'
            }];
        }

        // Try to extract the list ID from the current URL or page
        const listId = await page.evaluate(`() => {
            const match = window.location.href.match(/\\/lists\\/(\\d+)/);
            return match ? match[1] : '';
        }`);

        return [{
            status: 'success',
            listId: listId || 'unknown',
            name: listName,
            description: listDescription,
            mode: isPrivate ? 'private' : 'public',
            message: 'List created successfully'
        }];
    },
});
