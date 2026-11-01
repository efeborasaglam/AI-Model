require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = process.env.MISTRAL_MODEL || 'mistralai/mistral-large-4-1t-a52b';

const variants = [
    { label: 'no reasoning_effort', extra: {} },
    { label: 'reasoning_effort=low', extra: { reasoning_effort: 'low' } },
    { label: 'reasoning_effort=medium', extra: { reasoning_effort: 'medium' } },
    { label: 'reasoning_effort=high', extra: { reasoning_effort: 'high' } },
];

(async () => {
    console.log('Model:', MODEL);
    for (const v of variants) {
        const t = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60000);
        try {
            const res = await fetch(URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [{ role: 'user', content: 'Return only JSON: {"amount": 10.9, "currency": "CHF"}' }],
                    max_tokens: 1024,
                    temperature: 0.1,
                    stream: false,
                    ...v.extra,
                }),
                signal: ctrl.signal,
            });
            const text = await res.text();
            console.log(`${v.label}: HTTP ${res.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`, text.slice(0, 150).replace(/\s+/g, ' '));
        } catch (e) {
            console.log(`${v.label}: ${e.name === 'AbortError' ? 'TIMEOUT after 60s' : e.message}`);
        } finally {
            clearTimeout(timer);
        }
    }
})();