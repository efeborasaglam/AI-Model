export async function api(url, options = {}) {
    const isForm = options.body instanceof FormData;

    const res = await fetch(url, {
        method: options.method || 'GET',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: isForm ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
}