// tripo3d credits — what the account can still spend before a generate command.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { HOST, api, ensureStudio, requireSession, smartMeshP2Trial } from './utils.js';

cli({
    site: 'tripo3d',
    name: 'credits',
    description: 'Show the Tripo credit balance, plan, monthly export allowance, and remaining Smart Mesh P2 free trials',
    access: 'read',
    example: 'opencli tripo3d credits',
    domain: HOST,
    strategy: Strategy.INTERCEPT,
    browser: true,
    navigateBefore: false,
    args: [],
    columns: ['credits', 'expiringCredits', 'expiringDate', 'plan', 'planValidUntil', 'exportsUsed', 'exportsTotal', 'exportsResetAt', 'p2TrialsLeft', 'p2TrialsTotal'],
    func: async (page) => {
        await ensureStudio(page);
        await requireSession(page);

        const payment = await api(page, '/v2/studio/user/profile/payment', { method: 'GET' });
        // The export allowance lives on a different endpoint and is absent for
        // plans that do not meter exports.
        const limit = (await api(page, '/v2/studio/marketing/export-limit', { method: 'GET' }).catch(() => null))?.export_limit ?? null;
        // Free P2 generations. Absent (null) on plans that carry no such pool —
        // which is not the same as "used them all", so it stays null, not 0.
        const p2 = await smartMeshP2Trial(page);

        return [{
            credits: payment?.wallet?.total_credit ?? null,
            expiringCredits: payment?.wallet?.expiring_credit ?? null,
            expiringDate: payment?.wallet?.expiring_date ?? null,
            plan: payment?.member?.type ?? null,
            planValidUntil: payment?.member?.valid_until ?? null,
            exportsUsed: limit?.used_count ?? null,
            exportsTotal: limit?.total_count ?? null,
            exportsResetAt: limit?.expire_at ?? null,
            p2TrialsLeft: p2?.remaining ?? null,
            p2TrialsTotal: p2?.total_count ?? null,
        }];
    },
});
