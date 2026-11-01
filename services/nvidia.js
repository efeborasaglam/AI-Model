const { createCanvas, Path2D, DOMMatrix, ImageData } = require('@napi-rs/canvas');

const PARSE_URL = 'https://ai.api.nvidia.com/v1/retrieval/nvidia/nemotron-3.5-parse/parse';
const CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistralai/mistral-large-4-1t-a52b';

globalThis.Path2D = Path2D;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;

class NodeCanvasFactory {
    create(width, height) {
        const canvas = createCanvas(width, height);
        return { canvas, context: canvas.getContext('2d') };
    }
    reset(cc, width, height) {
        cc.canvas.width = width;
        cc.canvas.height = height;
    }
    destroy(cc) {
        cc.canvas.width = 0;
        cc.canvas.height = 0;
        cc.canvas = null;
        cc.context = null;
    }
}



function key() {
    if (!process.env.NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY is missing in .env');
    return process.env.NVIDIA_API_KEY;
}

// PDF -> list of PNG buffers (first pages only)
async function pdfToImages(buffer, maxPages = 3) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        CanvasFactory: NodeCanvasFactory,
    }).promise;

    const images = [];
    const pages = Math.min(doc.numPages, maxPages);

    for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        images.push({ buffer: canvas.toBuffer('image/png'), mime: 'image/png' });
    }
    return images;
}

// Nemotron Parse: one image -> text
async function parseImage(buffer, mime) {
    const form = new FormData();
    form.append('document', new Blob([buffer], { type: mime }), mime === 'image/png' ? 'page.png' : 'page.jpg');
    form.append(
        'options',
        new Blob([JSON.stringify({ decoding: { max_output_tokens: 4096 } })], { type: 'application/json' })
    );

    const res = await fetch(PARSE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, Accept: 'application/json' },
        body: form,
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Nemotron Parse failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const result = await res.json();
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content ?? result);
    console.log('[parse]', content.slice(0, 300).replace(/\s+/g, ' '));
    return content;
}

function safeJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The AI returned no JSON.');
    return JSON.parse(match[0]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYWORDS = /(rechnungsbetrag|gesamtbetrag|total|zu zahlen|zahlbar|fällig|iban|zahlteil|betrag|mwst|mehrwertsteuer|rechnungsnummer|rechnungsdatum|amount due|erinnerung|mahnung)/gi;

function compactText(raw) {
    return raw
        .replace(/<(x|y)_[\d.]+>/g, '')
        .replace(/<class_[\w-]+>/g, ' ')
        .replace(/\\begin\{tabular\}\{[^}]*\}/g, '')
        .replace(/\\end\{tabular\}/g, '')
        .replace(/\\\\/g, '\n')
        .replace(/&/g, ' | ')
        .replace(/\*\*/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();
}

// keep only the 2 most invoice-like pages, max ~5000 chars in total
function pickRelevantText(text) {
    const pages = text.split(/\n\s*---\s*\n/).map(compactText).filter(Boolean);
    const scored = pages.map((p, i) => ({ p: p.slice(0, 2500), i, score: (p.match(KEYWORDS) || []).length }));
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.p)
        .join('\n\n');
}
async function callMistral(body, attempts = 4) {
    let lastError;

    for (let n = 1; n <= attempts; n++) {
        const started = Date.now();
        const controller = new AbortController();
        let idle;
        const arm = () => {
            clearTimeout(idle);
            idle = setTimeout(() => controller.abort(), 60000); // abort only if nothing arrives for 60 s
        };

        try {
            arm();
            const res = await fetch(CHAT_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key()}`,
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },
                body: JSON.stringify({ ...body, stream: true }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const text = await res.text();
                lastError = new Error(`Mistral failed (${res.status}): ${text.slice(0, 300)}`);
                lastError.retryable = [429, 502, 503, 504].includes(res.status);
            } else {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let content = '';
                let finish = null;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    arm();
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        const l = line.trim();
                        if (!l.startsWith('data:')) continue;
                        const payload = l.slice(5).trim();
                        if (payload === '[DONE]') continue;
                        try {
                            const choice = JSON.parse(payload).choices?.[0];
                            if (choice?.delta?.content) content += choice.delta.content;
                            if (choice?.finish_reason) finish = choice.finish_reason;
                        } catch {
                            /* ignore partial lines */
                        }
                    }
                }

                if (content.trim()) return { content, finish };
                lastError = new Error('Mistral returned an empty answer.');
                lastError.retryable = true;
            }
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error('Mistral sent nothing for 60 s.') : err;
            lastError.retryable = true;
        } finally {
            clearTimeout(idle);
        }

        if (!lastError.retryable) throw lastError;

        console.warn(`[mistral] attempt ${n}/${attempts} failed after ${((Date.now() - started) / 1000).toFixed(0)}s: ${lastError.message}`);
        await sleep(3000 * n);
    }

    throw lastError;
}

async function extractInvoice(text) {
    const cleaned = pickRelevantText(text);
    console.log('[mistral] sending', cleaned.length, 'chars');

    const prompt = `You are an invoice extraction system. Below is text read from a document (it may be German or Swiss).
Decide if it is an invoice, payment request or payment reminder, and extract the fields.

Return ONLY a JSON object with exactly these keys:
{
  "isInvoice": boolean,
  "category": "invoice" | "contract" | "update" | "other",
  "vendor": string | null,
  "description": string | null,
  "invoiceNumber": string | null,
  "amount": number | null,
  "currency": string,
  "reminderLevel": number,
  "issueDate": "YYYY-MM-DD" | null,
  "dueDate": "YYYY-MM-DD" | null,
  "iban": string | null,
  "summary": string
}
Rules: dates are DD.MM.YYYY in the text, convert them to YYYY-MM-DD. "amount" is the total to pay (Rechnungsbetrag / Gesamtbetrag), dot as decimal separator. "currency" is an ISO code like CHF or EUR. "iban" is the payee IBAN without spaces. "summary" is 1-2 plain English sentences with exact dates and amounts. "reminderLevel" is 0 for a normal invoice, 1 for a first reminder (1. Mahnung / Zahlungserinnerung), 2 for a second reminder (2. Mahnung / 2. Erinnerung), and so on. Use null if a value is missing. Do not add any text before or after the JSON.

DOCUMENT TEXT:
${cleaned}`;

    const { content, finish } = await callMistral({
        model: MISTRAL_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.1,
        reasoning_effort: 'low',
    });

    console.log('[mistral]', content.slice(0, 500).replace(/\s+/g, ' '), '| finish:', finish);
    return safeJson(content);
}

module.exports = { pdfToImages, parseImage, extractInvoice };