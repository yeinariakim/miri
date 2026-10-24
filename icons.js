// 선 아이콘 (24×24, currentColor)
const P = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01" stroke-width="2.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8 5.2-5.4"/>',
  alertTriangle:
    '<path d="M10.3 4.2 2.9 17.3a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/>',
  alertOctagon:
    '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2Z"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  gift:
    '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M12 8v12.5M5.5 12v7a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-7"/><path d="M12 8S10.6 3.5 8.3 3.5a2.25 2.25 0 0 0 0 4.5M12 8s1.4-4.5 3.7-4.5a2.25 2.25 0 0 1 0 4.5"/>',
  envelope: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  suitcase:
    '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M9 11v5M15 11v5"/>',
  heartPulse:
    '<path d="M19.8 13.5c.8-1.2 1.2-2.4 1.2-3.7A4.8 4.8 0 0 0 12 7.2a4.8 4.8 0 0 0-9 2.6c0 1.3.4 2.5 1.2 3.7"/><path d="M3 12.5h4l1.5-2.5 3 5 1.5-2.5h8M6.5 16.5c2 2.1 4.4 3.6 5.5 4.2 1.1-.6 3.5-2.1 5.5-4.2"/>',
  laptop: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  dots: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.4"/>',
  download: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 20h15"/>',
  upload: '<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4.5 20h15"/>',
  trash:
    '<path d="M4 7h16M10 11v6M14 11v6M6 7l.9 12.1a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9L18 7M9 7V4.5h6V7"/>',
  pencil: '<path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m14 6 3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  wallet:
    '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16.5" height="11.5" rx="2.5"/><path d="M16 13.8h.01" stroke-width="2.6"/>',
  sparkCalendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4"/>',
};

export const CATEGORY_ICON = {
  선물: 'gift',
  경조사: 'envelope',
  여행: 'suitcase',
  건강: 'heartPulse',
  전자제품: 'laptop',
  기타: 'dots',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
