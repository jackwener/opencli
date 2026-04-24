import { describe, expect, it } from 'vitest';
import { __test__ } from './ax.js';

describe('chatgpt-app AX send script', () => {
    it('prefers the focused composer before falling back to the last editable input', () => {
        expect(__test__.AX_SEND_SCRIPT).toContain('kAXFocusedUIElementAttribute');
    });

    it('fails fast when the AX set does not round-trip into the composer value', () => {
        expect(__test__.AX_SEND_SCRIPT).toContain('Failed to verify input value after AX set');
    });

    it('does not report success until the prompt leaves the composer after send', () => {
        expect(__test__.AX_SEND_SCRIPT).toContain('Prompt did not leave input after pressing send');
    });
});

describe('chatgpt-app generating detection', () => {
    it('supports both english and zh-CN stop-generating labels', () => {
        expect(__test__.AX_GENERATING_SCRIPT).toContain('Stop generating');
        expect(__test__.AX_GENERATING_SCRIPT).toContain('停止生成');
    });
});
