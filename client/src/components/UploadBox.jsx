import { useRef, useState } from 'react';
import { api } from '../api';

export default function UploadBox({ onUploaded }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [drag, setDrag] = useState(false);

    const send = async (file) => {
        if (!file) return;
        setError('');
        setBusy(true);
        try {
            const body = new FormData();
            body.append('file', file);
            const invoice = await api('/api/invoices/upload', { method: 'POST', body });
            onUploaded(invoice);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div>
            <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onClick={() => !busy && inputRef.current.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) send(e.dataTransfer.files[0]); }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    hidden
                    onChange={(e) => send(e.target.files[0])}
                />
                {busy ? (
                    <p>Reading your invoice… this can take 20–40 seconds.</p>
                ) : (
                    <p><strong>Upload an invoice</strong><br />Drop a PDF, PNG or JPG here, or click to browse.</p>
                )}
            </div>
            {error && <div className="error">{error}</div>}
        </div>
    );
}