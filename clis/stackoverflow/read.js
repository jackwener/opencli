/**
 * Stack Overflow question reader.
 *
 * Hits the public Stack Exchange API:
 *   GET /questions/{id}?site=stackoverflow&filter=withbody
 *   GET /questions/{id}/answers?site=stackoverflow&filter=withbody
 *   GET /questions/{id}/comments?site=stackoverflow&filter=withbody
 *   GET /answers/{a1;a2;...}/comments?site=stackoverflow&filter=withbody
 *
 * Three calls are needed because comments under answers are not bundled in
 * the answers payload. We batch all answer-comment fetches into a single
 * semicolon-joined call. SO has its own quota (300/day for unauthenticated
 * IP), but a `read` consumes at most 4 quota units.
 *
 * Output rows mirror `hackernews read` and `lobsters read`:
 *   - first row is the question itself (`type=POST`)
 *   - one row per top-level question comment (`type=Q-COMMENT`)
 *   - per answer: an `ANSWER` row plus its `A-COMMENT` rows indented under it
 *   - the accepted answer (if any) is surfaced first and tagged `accepted=true`
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

const SE_API_BASE = 'https://api.stackexchange.com/2.3';
const SE_SITE = 'stackoverflow';

async function fetchJson(url, label) {
    let res;
    try {
        res = await fetch(url);
    } catch (e) {
        throw new CommandExecutionError(
            `Network failure fetching ${label}: ${e.message}`,
            'Check connectivity to api.stackexchange.com',
        );
    }
    if (res.status === 404) {
        throw new EmptyResultError(label, `${label} not found`);
    }
    if (!res.ok) {
        throw new CommandExecutionError(
            `Stack Exchange API HTTP ${res.status} for ${label}`,
            'Check the question id and quota (300/day per IP)',
        );
    }
    let json;
    try {
        json = await res.json();
    } catch (e) {
        throw new CommandExecutionError(
            `Malformed JSON from Stack Exchange API for ${label}: ${e.message}`,
            'The API returned a non-JSON body — likely a transient outage',
        );
    }
    if (json && json.error_id) {
        throw new CommandExecutionError(
            `Stack Exchange API error ${json.error_id} (${json.error_name}) for ${label}: ${json.error_message || ''}`,
            'Common causes: invalid filter, throttled, or quota exhausted',
        );
    }
    return json;
}

/**
 * CLI args may arrive as strings (`--limit 5` → `'5'`) when not coerced by the
 * arg type system. Coerce-then-validate so `Number.isInteger` actually catches
 * the bad cases, and reject NaN explicitly.
 */
function coerceInt(value) {
    if (value === undefined || value === null || value === '') return NaN;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && Number.isInteger(n) ? n : NaN;
}

function requirePositiveInt(value, label) {
    const n = coerceInt(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw new ArgumentError(`${label} must be a positive integer, got ${JSON.stringify(value)}`);
    }
    return n;
}

function requireMinInt(value, min, label) {
    const n = coerceInt(value);
    if (!Number.isInteger(n) || n < min) {
        throw new ArgumentError(`${label} must be an integer >= ${min}, got ${JSON.stringify(value)}`);
    }
    return n;
}

const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
    copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

/** Decode named/numeric HTML entities. Used on both body HTML and display names. */
function decodeEntities(text) {
    if (!text) return '';
    return String(text)
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            const code = parseInt(dec, 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        })
        .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

/** SO renders bodies as HTML — convert to plain text similar to HN/lobsters. */
function htmlToText(html) {
    if (!html) return '';
    const stripped = String(html)
        .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n$1\n')
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        .replace(/<p[^>]*>/gi, '\n\n')
        .replace(/<\/p>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/li>/gi, '')
        .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
        .replace(/<[^>]+>/g, '');
    return decodeEntities(stripped)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function authorName(owner) {
    return decodeEntities(owner?.display_name || '') || '[deleted]';
}

function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.slice(0, maxLength) + ' ... [truncated]';
}

function indentLines(text, depth) {
    if (depth === 0) return text;
    const indent = '  '.repeat(depth);
    const prefix = `${indent}> `;
    return text.split('\n').map((line) => prefix + line).join('\n');
}

cli({
    site: 'stackoverflow',
    name: 'read',
    description: 'Read a Stack Overflow question with answers and comments',
    domain: 'stackoverflow.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'id', required: true, positional: true, help: 'Stack Overflow question id (numeric, e.g. 79935770)' },
        { name: 'answers-limit', type: 'int', default: 10, help: 'Max answers to include (accepted answer always included first)' },
        { name: 'comments-limit', type: 'int', default: 5, help: 'Max comments per question/answer' },
        { name: 'max-length', type: 'int', default: 4000, help: 'Max characters per body / answer / comment (min 100)' },
    ],
    columns: ['type', 'author', 'score', 'accepted', 'text'],
    func: async (args) => {
        const id = String(args.id || '').trim();
        if (!/^\d+$/.test(id)) {
            throw new ArgumentError(`Invalid Stack Overflow question id: ${args.id}`, 'Pass a numeric id like 79935770');
        }
        const answersLimit = requirePositiveInt(args['answers-limit'] ?? 10, 'stackoverflow read --answers-limit');
        const commentsLimit = requirePositiveInt(args['comments-limit'] ?? 5, 'stackoverflow read --comments-limit');
        const maxLength = requireMinInt(args['max-length'] ?? 4000, 100, 'stackoverflow read --max-length');

        const qUrl = `${SE_API_BASE}/questions/${id}?site=${SE_SITE}&filter=withbody`;
        const qData = await fetchJson(qUrl, `stackoverflow/${id}`);
        const question = (qData.items || [])[0];
        if (!question) {
            throw new EmptyResultError(`stackoverflow/${id}`, 'Question not found');
        }

        // Fetch question comments and answers in parallel.
        const [qCommentsData, answersData] = await Promise.all([
            fetchJson(
                `${SE_API_BASE}/questions/${id}/comments?site=${SE_SITE}&filter=withbody&order=asc&sort=creation`,
                `stackoverflow/${id}/comments`,
            ),
            fetchJson(
                `${SE_API_BASE}/questions/${id}/answers?site=${SE_SITE}&filter=withbody&order=desc&sort=votes`,
                `stackoverflow/${id}/answers`,
            ),
        ]);

        const allAnswers = answersData.items || [];
        // Surface accepted answer first, then by score order.
        const accepted = allAnswers.find((a) => a.is_accepted);
        const others = allAnswers.filter((a) => !a.is_accepted);
        const orderedAnswers = (accepted ? [accepted] : []).concat(others).slice(0, answersLimit);

        // Batch-fetch answer-comments in a single call when there's at least one answer.
        let answerCommentsByAnswerId = new Map();
        if (orderedAnswers.length > 0) {
            const ids = orderedAnswers.map((a) => a.answer_id).join(';');
            const ansCommentsData = await fetchJson(
                `${SE_API_BASE}/answers/${ids}/comments?site=${SE_SITE}&filter=withbody&order=asc&sort=creation`,
                `stackoverflow/${id}/answer-comments`,
            );
            for (const c of ansCommentsData.items || []) {
                if (!c.post_id) continue;
                if (!answerCommentsByAnswerId.has(c.post_id)) {
                    answerCommentsByAnswerId.set(c.post_id, []);
                }
                answerCommentsByAnswerId.get(c.post_id).push(c);
            }
        }

        const rows = [];

        // POST row: question
        const qBody = htmlToText(question.body || '');
        const qTextParts = [
            question.title || '',
            qBody,
            question.link || '',
        ].filter(Boolean);
        rows.push({
            type: 'POST',
            author: authorName(question.owner),
            score: question.score ?? 0,
            accepted: '',
            text: truncate(qTextParts.join('\n\n'), maxLength),
        });

        // Q-COMMENT rows
        const qComments = (qCommentsData.items || []).slice(0, commentsLimit);
        for (const c of qComments) {
            const text = indentLines(htmlToText(c.body || ''), 1);
            rows.push({
                type: 'Q-COMMENT',
                author: authorName(c.owner),
                score: c.score ?? 0,
                accepted: '',
                text: truncate(text, maxLength),
            });
        }

        // ANSWER + A-COMMENT rows
        for (const ans of orderedAnswers) {
            rows.push({
                type: 'ANSWER',
                author: authorName(ans.owner),
                score: ans.score ?? 0,
                accepted: ans.is_accepted ? 'true' : '',
                text: truncate(htmlToText(ans.body || ''), maxLength),
            });
            const ansComments = (answerCommentsByAnswerId.get(ans.answer_id) || []).slice(0, commentsLimit);
            for (const c of ansComments) {
                const text = indentLines(htmlToText(c.body || ''), 1);
                rows.push({
                    type: 'A-COMMENT',
                    author: authorName(c.owner),
                    score: c.score ?? 0,
                    accepted: '',
                    text: truncate(text, maxLength),
                });
            }
        }

        return rows;
    },
});
