const { describe, it } = require('mocha');
const assert = require('assert');
const SynthesisRequest = require('../src/modules/tts/domain/SynthesisRequest');
const NormalizedSynthesisInput = require('../src/modules/tts/domain/NormalizedSynthesisInput');

describe('NormalizedSynthesisInput', () => {
    describe('text from request.text', () => {
        it('extracts text from request.text', () => {
            const req = new SynthesisRequest({
                text: '你好世界',
                service: 'moss_tts',
                options: { voice: 'moss-tts-ashui' }
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.text, '你好世界');
        });

        it('injects text into params', () => {
            const req = new SynthesisRequest({
                text: '联调测试',
                service: 'moss_tts',
                options: { voice: 'test-voice' }
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.params.text, '联调测试');
            assert.strictEqual(n.params.voice, 'test-voice');
        });
    });

    describe('text from input.raw', () => {
        it('falls back to input.raw when text is absent', () => {
            const req = new SynthesisRequest({
                service: 'moss_tts',
                input: { type: 'plainText', raw: 'raw text content' },
                options: {}
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.text, 'raw text content');
            assert.strictEqual(n.params.text, 'raw text content');
        });
    });

    describe('text from input.segments', () => {
        it('falls back to segments when text and input.raw are absent', () => {
            const req = new SynthesisRequest({
                service: 'moss_tts',
                input: {
                    type: 'segments',
                    segments: [
                        { text: '第一段文字', speaker: 'a' },
                        { text: '第二段文字', speaker: 'b' }
                    ]
                },
                options: {}
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.text, '第一段文字\n第二段文字');
            assert.strictEqual(n.params.text, '第一段文字\n第二段文字');
        });
    });

    describe('text priority', () => {
        it('text takes priority over input.raw', () => {
            const req = new SynthesisRequest({
                text: 'direct text',
                service: 'moss_tts',
                input: { type: 'plainText', raw: 'input raw text' },
                options: {}
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.text, 'direct text');
            assert.strictEqual(n.params.text, 'direct text');
        });
    });

    describe('empty text handling', () => {
        it('returns empty string when no text source is available', () => {
            const req = new SynthesisRequest({
                service: 'moss_tts',
                options: {}
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.text, '');
            assert.strictEqual(n.params.text, '');
        });
    });

    describe('params merging', () => {
        it('merges options with text', () => {
            const req = new SynthesisRequest({
                text: 'test',
                service: 'moss_tts',
                options: { speed: 1.5, pitch: 0.8, voiceId: 'test-id' }
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.params.text, 'test');
            assert.strictEqual(n.params.speed, 1.5);
            assert.strictEqual(n.params.pitch, 0.8);
            assert.strictEqual(n.params.voiceId, 'test-id');
        });
    });

    describe('input passthrough', () => {
        it('returns null input when request has no input', () => {
            const req = new SynthesisRequest({
                text: 'test',
                service: 'moss_tts',
                options: {}
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.input, null);
        });

        it('returns input object when present', () => {
            const inputObj = { type: 'plainText', raw: 'raw text' };
            const req = new SynthesisRequest({
                text: 'test',
                service: 'moss_tts',
                input: inputObj,
                options: {}
            });
            const n = new NormalizedSynthesisInput(req);
            assert.strictEqual(n.input, inputObj);
        });
    });

    describe('capability validation readiness', () => {
        it('params always contains text for CompiledCapability.validate()', () => {
            // This test verifies the fix for the original bug:
            // text must be in params so capability.validate() doesn't report "required field missing"
            const req = new SynthesisRequest({
                text: 'capability test',
                service: 'moss_tts',
                options: { model: 'moss-tts' }
            });
            const n = new NormalizedSynthesisInput(req);
            assert.ok('text' in n.params);
            assert.ok(n.params.text.length > 0);
            assert.strictEqual(n.params.text, 'capability test');
        });
    });
});