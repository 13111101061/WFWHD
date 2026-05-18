const { describe, it } = require('mocha');
const assert = require('assert');
const TemplateResolver = require('../src/modules/tts/providers/TemplateResolver');

describe('TemplateResolver', () => {
    const resolver = new TemplateResolver();
    const ctx = {
        text: '你好世界',
        params: {
            model: 'moss-tts',
            voice_id: '2001257729754140672',
            sampling_params: {
                temperature: 1.7,
                top_p: 0.8,
                top_k: 25,
                max_new_tokens: 20000
            },
            expected_duration_sec: 10
        },
        credential: {
            apiKey: 'sk-0a278f2e831f39a5ae253b3ce3d00ee67388a554eb1b5b5f'
        }
    };

    describe('_resolve string templates', () => {
        it('pure template "${text}" returns string value', () => {
            assert.strictEqual(resolver.resolve('${text}', ctx), '你好世界');
        });

        it('pure template "${params.model}" returns string value', () => {
            assert.strictEqual(resolver.resolve('${params.model}', ctx), 'moss-tts');
        });

        it('mixed template "Bearer ${credential.apiKey}" resolves correctly', () => {
            const result = resolver.resolve('Bearer ${credential.apiKey}', ctx);
            assert.strictEqual(result, `Bearer ${ctx.credential.apiKey}`);
            assert.strictEqual(typeof result, 'string');
        });

        it('pure template "${params.sampling_params}" preserves object type', () => {
            const result = resolver.resolve('${params.sampling_params}', ctx);
            assert.strictEqual(typeof result, 'object');
            assert.strictEqual(result.temperature, 1.7);
            assert.strictEqual(result.top_p, 0.8);
        });

        it('pure template for undefined path returns undefined', () => {
            const result = resolver.resolve('${params.nonexistent}', ctx);
            assert.strictEqual(result, undefined);
        });

        it('mixed template with undefined path inlines empty string', () => {
            const result = resolver.resolve('prefix ${params.nonexistent} suffix', ctx);
            assert.strictEqual(result, 'prefix  suffix');
        });

        it('multiple placeholders in one string', () => {
            const result = resolver.resolve('${params.model}/${params.voice_id}', ctx);
            assert.strictEqual(result, 'moss-tts/2001257729754140672');
        });

        it('no placeholders returns string unchanged', () => {
            assert.strictEqual(resolver.resolve('hello world', ctx), 'hello world');
        });
    });

    describe('_resolve object templates', () => {
        it('resolves nested object with mixed templates', () => {
            const template = {
                model: '${params.model}',
                text: '${text}',
                voice_id: '${params.voice_id}',
                sampling_params: '${params.sampling_params}',
                meta_info: true
            };
            const result = resolver.resolve(template, ctx);
            assert.strictEqual(result.model, 'moss-tts');
            assert.strictEqual(result.text, '你好世界');
            assert.strictEqual(result.voice_id, '2001257729754140672');
            assert.deepStrictEqual(result.sampling_params, {
                temperature: 1.7,
                top_p: 0.8,
                top_k: 25,
                max_new_tokens: 20000
            });
            assert.strictEqual(result.meta_info, true);
        });

        it('strips undefined values from object result', () => {
            const template = {
                present: '${text}',
                missing: '${params.nonexistent}'
            };
            const result = resolver.resolve(template, ctx);
            assert.strictEqual(result.present, '你好世界');
            assert.strictEqual('missing' in result, false);
        });

        it('strips empty string values from object result', () => {
            const template = {
                present: '${text}',
                emptystr: ''
            };
            const result = resolver.resolve(template, ctx);
            assert.strictEqual(result.present, '你好世界');
            assert.strictEqual('emptystr' in result, false);
        });

        it('strips null values from object result', () => {
            const template = {
                present: '${text}',
                nullval: null
            };
            const result = resolver.resolve(template, ctx);
            assert.strictEqual(result.present, '你好世界');
            assert.strictEqual('nullval' in result, false);
        });
    });

    describe('_resolve arrays', () => {
        it('resolves array elements', () => {
            const result = resolver.resolve(['${text}', '${params.model}'], ctx);
            assert.deepStrictEqual(result, ['你好世界', 'moss-tts']);
        });
    });

    describe('_resolve header template (integration)', () => {
        it('MOSS Authorization header resolves correctly', () => {
            const headers = {
                'Authorization': 'Bearer ${credential.apiKey}',
                'Content-Type': 'application/json'
            };
            const result = resolver.resolve(headers, ctx);
            assert.strictEqual(result['Authorization'], `Bearer ${ctx.credential.apiKey}`);
            assert.strictEqual(result['Content-Type'], 'application/json');
        });
    });

    describe('_resolve body template (integration)', () => {
        it('MOSS body template resolves correctly', () => {
            const body = {
                model: '${params.model}',
                text: '${text}',
                voice_id: '${params.voice_id}',
                expected_duration_sec: '${params.expected_duration_sec}',
                sampling_params: '${params.sampling_params}',
                meta_info: true
            };
            const result = resolver.resolve(body, ctx);
            assert.strictEqual(result.model, 'moss-tts');
            assert.strictEqual(result.text, '你好世界');
            assert.strictEqual(result.voice_id, '2001257729754140672');
            assert.strictEqual(result.expected_duration_sec, 10);
            assert.deepStrictEqual(result.sampling_params, {
                temperature: 1.7,
                top_p: 0.8,
                top_k: 25,
                max_new_tokens: 20000
            });
            assert.strictEqual(result.meta_info, true);
        });

        it('omits expected_duration_sec when not provided', () => {
            const noDurationCtx = {
                ...ctx,
                params: { ...ctx.params, expected_duration_sec: undefined }
            };
            const body = {
                model: '${params.model}',
                text: '${text}',
                voice_id: '${params.voice_id}',
                expected_duration_sec: '${params.expected_duration_sec}',
                sampling_params: '${params.sampling_params}',
                meta_info: true
            };
            const result = resolver.resolve(body, noDurationCtx);
            assert.strictEqual('expected_duration_sec' in result, false);
        });
    });
});