/**
 * LifeOS 工具函数库
 */

export function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatTime(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

export function daysBetween(date1, date2) {
    const d1 = new Date(date1).setHours(0, 0, 0, 0);
    const d2 = new Date(date2).setHours(0, 0, 0, 0);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle(func, limit = 100) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) { func(...args); inThrottle = true; setTimeout(() => inThrottle = false, limit); }
    };
}

export function deepClone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function compressImage(base64, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
            canvas.width = w; canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = base64;
    });
}

export function calculateQuadrant(deadline, priority = 5) {
    const daysUntil = daysBetween(new Date(), new Date(deadline));
    let urgency;
    if (daysUntil <= 1) urgency = 1.0;
    else if (daysUntil <= 3) urgency = 0.8;
    else if (daysUntil <= 7) urgency = 0.6;
    else if (daysUntil <= 14) urgency = 0.4;
    else urgency = 0.2;
    const importance = priority / 10;
    if (importance >= 0.7 && urgency >= 0.7) return 'urgent-important';
    if (importance >= 0.7 && urgency < 0.7) return 'important-not-urgent';
    if (importance < 0.7 && urgency >= 0.7) return 'urgent-not-important';
    return 'not-urgent-not-important';
}

export function getQuadrantInfo(quadrant) {
    const map = {
        'urgent-important': { label: '重要·紧急', color: 'var(--color-urgent)', icon: '🔴' },
        'important-not-urgent': { label: '重要·不紧急', color: 'var(--color-important)', icon: '🔵' },
        'urgent-not-important': { label: '紧急·不重要', color: 'var(--color-warning)', icon: '🟡' },
        'not-urgent-not-important': { label: '不重要·不紧急', color: 'var(--text-muted)', icon: '⚪' }
    };
    return map[quadrant] || map['not-urgent-not-important'];
}

export function markdownToHtml(markdown) {
    if (!markdown) return '';
    return markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/^```\n?([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/^(\-|\*) (.*$)/gim, '<li>$2</li>')
        .replace(/(<li>.*<\/li>\n?)+/gim, '<ul>$&</ul>')
        .replace(/\n/gim, '<br>');
}
