// Set de iconos de linea (stroke=currentColor) usados en toda la web. Sin emojis.
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  home: `<svg ${ICON_ATTRS}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1V15a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4.5a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V10"/></svg>`,
  utensils: `<svg ${ICON_ATTRS}><path d="M7 2v8a2 2 0 0 0 4 0V2"/><path d="M9 10v12"/><path d="M16 2c-1.4 0-2.5 2-2.5 5.5S14.6 13 16 13s2.5-2 2.5-5.5S17.4 2 16 2Z"/><path d="M16 13v9"/></svg>`,
  heartPulse: `<svg ${ICON_ATTRS}><path d="M3.5 8.6c0-3 2.3-5.1 5-5.1 1.6 0 2.9.8 3.5 2 .6-1.2 1.9-2 3.5-2 2.7 0 5 2.1 5 5.1 0 3.6-3.4 6.5-8.5 11.4C7.9 15.1 3.5 12.2 3.5 8.6Z"/><path d="M5 12h2.5l1.5-2.5 2 4 1.5-2.5H16"/></svg>`,
  shoppingBag: `<svg ${ICON_ATTRS}><path d="M6.5 8h11l1 12.5a1 1 0 0 1-1 1.5H6.5a1 1 0 0 1-1-1.5L6.5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
  wrench: `<svg ${ICON_ATTRS}><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z"/></svg>`,
  dumbbell: `<svg ${ICON_ATTRS}><path d="M4 9v6"/><path d="M2.5 10.5v3"/><path d="M7 7v10"/><path d="M17 7v10"/><path d="M20 9v6"/><path d="M21.5 10.5v3"/><path d="M7 12h10"/></svg>`,
  car: `<svg ${ICON_ATTRS}><path d="M4 16V11.5L6 7h12l2 4.5V16"/><path d="M4 16h16v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V17h-9v1.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V16Z"/><circle cx="8" cy="16" r="0.6" fill="currentColor"/><circle cx="16" cy="16" r="0.6" fill="currentColor"/></svg>`,
  building: `<svg ${ICON_ATTRS}><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h0.01M12 7h0.01M15 7h0.01M9 11h0.01M12 11h0.01M15 11h0.01M9 15h0.01M15 15h0.01"/><path d="M10.5 21v-3a1.5 1.5 0 0 1 3 0v3"/></svg>`,
  graduation: `<svg ${ICON_ATTRS}><path d="M2 8 12 4l10 4-10 4-10-4Z"/><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/><path d="M22 8v6"/></svg>`,
  package: `<svg ${ICON_ATTRS}><path d="M3.5 7.5 12 3l8.5 4.5V16L12 20.5 3.5 16Z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v8.5"/></svg>`,

  userCheck: `<svg ${ICON_ATTRS}><circle cx="10" cy="8" r="3.5"/><path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16.5 11.5 18 13l3-3"/></svg>`,
  calendarCheck: `<svg ${ICON_ATTRS}><rect x="3.5" y="4.5" width="17" height="16" rx="1.5"/><path d="M3.5 9h17"/><path d="M8 3v3M16 3v3"/><path d="M8.5 14 10.5 16l4-4.5"/></svg>`,
  creditCard: `<svg ${ICON_ATTRS}><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3 9.5h18"/><path d="M6.5 14.5h4"/></svg>`,
  imageStack: `<svg ${ICON_ATTRS}><rect x="3.5" y="4.5" width="14" height="14" rx="1.5"/><circle cx="8" cy="9" r="1.4"/><path d="M3.5 15l4-3.5 3 2.5 3.5-4 3 3"/></svg>`,
  headset: `<svg ${ICON_ATTRS}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="5" rx="1.2"/><rect x="17" y="14" width="4" height="5" rx="1.2"/><path d="M19 19v1a2 2 0 0 1-2 2h-3"/></svg>`,
  languages: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.4 3.8 5.7 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.7-3.8-9s1.3-6.6 3.8-9Z"/></svg>`,
  barChart: `<svg ${ICON_ATTRS}><path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/><path d="M3 20h18"/></svg>`,
  plug: `<svg ${ICON_ATTRS}><path d="M9 3v5M15 3v5"/><path d="M6.5 8h11l-.7 5.5a5 5 0 0 1-5 4.5 5 5 0 0 1-5-4.5L6.5 8Z"/><path d="M12 18v3"/></svg>`,
  bell: `<svg ${ICON_ATTRS}><path d="M6 17h12l-1.4-2A6.5 6.5 0 0 1 16 11V9a4 4 0 0 0-8 0v2a6.5 6.5 0 0 1-.6 4Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 1 5 14h6l-1 9 8.5-13h-6l1-9Z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
};
