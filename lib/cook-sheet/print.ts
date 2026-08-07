/**
 * Print views for the cook sheet.
 *
 * These build a complete standalone HTML document from an already-calculated
 * CookSheet and open it in a new tab. Nothing is fetched, so no extra API
 * route or page is needed — the kitchen prints exactly what's on screen.
 */

import {
  COLOURS,
  DISH_LABELS_PER_SHEET,
  LOGO_LABELS_PER_SHEET,
  STICKER_BG,
  formatWeight,
  type CookSheet,
  type CookSheetDish,
} from './calculate';
import { CATEGORY_LABEL } from './recipes';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stickerBadge(dish: CookSheetDish, fontSize: number): string {
  const colour = dish.recipe.stickerColour;
  if (colour === 'n/a') return '';
  return `<span style="background:${STICKER_BG[colour]};color:#fff;font-size:${fontSize}px;font-weight:700;letter-spacing:.06em;padding:${Math.round(fontSize / 3)}px ${fontSize}px;border-radius:999px;text-transform:uppercase;display:inline-block;">${colour}</span>`;
}

/* ── A4 cook sheet ─────────────────────────────────────────────────────── */

export function renderCookSheetHtml(sheet: CookSheet): string {
  const dishBlocks = sheet.dishes
    .map((dish) => {
      const headerBg =
        dish.recipe.cat === 'breakfast'
          ? COLOURS.breakfast
          : dish.recipe.cat === 'dessert'
            ? COLOURS.dessert
            : COLOURS.green;

      const rows = dish.lines
        .map(
          (line) => `<tr style="background:${line.isMeat ? '#fffbf0' : '#fff'};">
        <td style="padding:7px 12px;font-size:12.5px;font-weight:${line.isMeat ? 600 : 400};border-bottom:1px solid ${COLOURS.lineSoft};">${escapeHtml(line.name)}${line.isMeat ? ` <span style="color:${COLOURS.gold};">&#9679;</span>` : ''}</td>
        <td style="padding:7px 12px;font-size:12.5px;border-bottom:1px solid ${COLOURS.lineSoft};white-space:nowrap;">${line.rawPerPortion}g${line.cookedPerPortion ? ` &rarr; <strong>${line.cookedPerPortion}g</strong> cooked` : ''}</td>
        <td style="padding:7px 12px;font-size:13px;font-weight:700;border-bottom:1px solid ${COLOURS.lineSoft};white-space:nowrap;">${formatWeight(line.totalRaw)}${line.totalCooked ? ` &rarr; <strong>${formatWeight(line.totalCooked)}</strong> cooked` : ''}</td>
      </tr>`,
        )
        .join('');

      return `<div style="margin-bottom:20px;border:1px solid ${COLOURS.line};border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      <div style="background:${headerBg};padding:13px 16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="color:${COLOURS.gold};font-size:15px;font-weight:600;line-height:1.3;">${escapeHtml(dish.recipe.name)}</div>
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${stickerBadge(dish, 10)}
            <span style="color:${COLOURS.sage};font-size:11px;">${CATEGORY_LABEL[dish.recipe.cat]} &middot; ${dish.ordered} ordered${dish.buffer ? ` + ${dish.buffer} buffer` : ''}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="color:#fff;font-size:30px;font-weight:700;line-height:1;">${dish.portions}</div>
          <div style="color:${COLOURS.sage};font-size:10px;text-transform:uppercase;letter-spacing:.08em;">portions</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:${COLOURS.cream};">
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Ingredient</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Per portion</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Total for ${dish.portions}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    })
    .join('');

  const shoppingBlocks = sheet.shopping
    .map((section) => {
      const headerBg =
        section.key === 'breakfast'
          ? COLOURS.breakfast
          : section.key === 'desserts'
            ? COLOURS.dessert
            : COLOURS.green;
      const rows = section.lines
        .map(
          (line) => `<tr>
        <td style="padding:8px 12px;font-size:12.5px;font-weight:${line.isMeat ? 600 : 400};border-bottom:1px solid ${COLOURS.lineSoft};">${line.isMeat ? '&#129385; ' : ''}${escapeHtml(line.name)}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid ${COLOURS.lineSoft};white-space:nowrap;">${formatWeight(line.totalGrams)}</td>
      </tr>`,
        )
        .join('');
      return `<div style="margin-top:16px;page-break-inside:avoid;">
      <div style="background:${headerBg};border-radius:8px 8px 0 0;padding:11px 16px;color:${COLOURS.gold};font-size:15px;font-weight:600;">${escapeHtml(section.title)}</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid ${COLOURS.line};border-top:none;"><tbody>${rows}</tbody></table>
    </div>`;
    })
    .join('');

  const colourRows = sheet.colourLabels
    .map(
      (row) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${COLOURS.lineSoft};"><span style="background:${STICKER_BG[row.colour]};color:#fff;padding:2px 10px;border-radius:999px;font-size:10.5px;font-weight:700;text-transform:uppercase;">${row.colour}</span></td>
      <td style="padding:8px 12px;font-size:12.5px;font-weight:600;border-bottom:1px solid ${COLOURS.lineSoft};">${row.portions}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:700;border-bottom:1px solid ${COLOURS.lineSoft};">${row.sheets} sheet${row.sheets === 1 ? '' : 's'}</td>
    </tr>`,
    )
    .join('');

  const dishLabelRows = sheet.dishes
    .map(
      (dish) => `<tr>
      <td style="padding:7px 12px;font-size:12.5px;border-bottom:1px solid ${COLOURS.lineSoft};">${escapeHtml(dish.recipe.name)}</td>
      <td style="padding:7px 12px;font-size:12.5px;font-weight:600;border-bottom:1px solid ${COLOURS.lineSoft};">${dish.portions}</td>
      <td style="padding:7px 12px;font-size:13px;font-weight:700;border-bottom:1px solid ${COLOURS.lineSoft};">${dish.dishLabelSheets} sheet${dish.dishLabelSheets === 1 ? '' : 's'}</td>
    </tr>`,
    )
    .join('');

  const unmatchedBlock = sheet.unmatched.length
    ? `<div style="margin-top:16px;border:2px solid #b3261e;border-radius:8px;padding:14px 16px;background:#fff5f5;page-break-inside:avoid;">
      <div style="color:#b3261e;font-size:14px;font-weight:700;margin-bottom:8px;">No recipe found &mdash; not costed or scaled below</div>
      ${sheet.unmatched.map((u) => `<div style="font-size:12.5px;">${escapeHtml(u.name)} &times; ${u.quantity}</div>`).join('')}
    </div>`
    : '';

  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8">
<title>prepcuisines cook sheet — ${escapeHtml(sheet.dateLabel)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  body { margin:0; background:${COLOURS.cream}; font-family:'Helvetica Neue',Arial,sans-serif; }
  @media print { #printBtn { display:none !important; } body { background:#fff; } * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head>
<body>
<div id="printBtn" style="position:fixed;bottom:24px;right:24px;z-index:99;">
  <button onclick="window.print()" style="background:${COLOURS.gold};color:${COLOURS.green};border:none;border-radius:8px;padding:14px 26px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.28);">Print cook sheet</button>
</div>
<div style="max-width:720px;margin:0 auto;padding:20px 16px;">
  <div style="background:${COLOURS.green};border-radius:10px 10px 0 0;padding:22px 26px;border-bottom:3px solid ${COLOURS.gold};">
    <div style="font-size:22px;color:${COLOURS.gold};letter-spacing:.16em;font-weight:300;">prepcuisines</div>
    <div style="font-size:11px;color:${COLOURS.sage};letter-spacing:.1em;margin-top:4px;text-transform:uppercase;">Cook sheet</div>
    <div style="font-size:19px;color:#fff;margin-top:8px;font-weight:600;">${escapeHtml(sheet.dateLabel)}</div>
    <div style="font-size:11px;color:${COLOURS.sage};margin-top:4px;">Generated ${sheet.generatedAt.toLocaleString('en-GB', { timeZone: 'Europe/London' })}</div>
    <div style="margin-top:10px;display:inline-block;background:${COLOURS.gold};color:${COLOURS.green};font-size:13.5px;font-weight:700;padding:6px 16px;border-radius:999px;">${sheet.totalOrdered} ordered &middot; ${sheet.totalPortions} portions to cook</div>
  </div>
  <div style="background:#fff;padding:18px;border:1px solid ${COLOURS.line};border-top:none;">
    ${unmatchedBlock}
    ${dishBlocks}
    ${shoppingBlocks}
  </div>
  <div style="margin-top:18px;background:#fff;border:1px solid ${COLOURS.line};border-radius:8px;overflow:hidden;page-break-inside:avoid;">
    <div style="background:${COLOURS.green};padding:11px 16px;color:${COLOURS.gold};font-size:15px;font-weight:600;">Labels</div>
    <div style="padding:14px 16px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead><tr style="background:${COLOURS.cream};">
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Sticker colour</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Portions</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Logo sheets (${LOGO_LABELS_PER_SHEET}/sheet)</th>
        </tr></thead>
        <tbody>${colourRows}</tbody>
      </table>
      <div style="font-size:12.5px;margin-bottom:10px;"><strong>Dish labels:</strong> ${sheet.totalDishLabels} needed &mdash; <strong>${sheet.totalDishLabelSheets} sheet${sheet.totalDishLabelSheets === 1 ? '' : 's'}</strong> (${DISH_LABELS_PER_SHEET}/sheet)</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:${COLOURS.cream};">
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Dish</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Portions</th>
          <th style="padding:7px 12px;font-size:10px;text-align:left;color:#6b7c5e;text-transform:uppercase;letter-spacing:.08em;">Sheets</th>
        </tr></thead>
        <tbody>${dishLabelRows}</tbody>
      </table>
    </div>
  </div>
  <div style="background:${COLOURS.green};border-radius:0 0 10px 10px;padding:13px 26px;text-align:center;margin-top:16px;">
    <span style="font-size:11px;color:${COLOURS.sage};letter-spacing:.1em;">prepcuisines.co.uk</span>
  </div>
</div>
</body></html>`;
}

/* ── 4x6 station labels (one page per dish) ────────────────────────────── */

export function renderLabelsHtml(sheet: CookSheet, mealsOnly = false): string {
  const dishes = mealsOnly
    ? sheet.dishes.filter((d) => d.recipe.cat === 'low' || d.recipe.cat === 'high')
    : sheet.dishes;

  const pages = dishes
    .map((dish) => {
      const rows = dish.lines
        .map(
          (line) => `<tr>
        <td style="padding:11px 8px;font-size:29px;font-weight:700;border-bottom:3px solid #ddd;">${escapeHtml(line.name)}${line.isMeat ? ' &#129385;' : ''}</td>
        <td style="padding:11px 8px;font-size:31px;font-weight:800;border-bottom:3px solid #ddd;text-align:right;white-space:nowrap;">${formatWeight(line.totalRaw)}${line.totalCooked ? `<span style="font-size:22px;font-weight:800;color:#666;"> &rarr; ${formatWeight(line.totalCooked)} ckd</span>` : ''}</td>
      </tr>`,
        )
        .join('');

      return `<div style="page-break-after:always;width:100%;height:6in;box-sizing:border-box;padding:20px;font-family:Arial,sans-serif;display:flex;flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:9px solid ${COLOURS.green};padding-bottom:11px;margin-bottom:11px;">
        <div>
          <div style="font-size:46px;font-weight:800;color:${COLOURS.green};line-height:1.08;">${escapeHtml(dish.recipe.name)}</div>
          <div style="margin-top:11px;">${stickerBadge(dish, 23)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;padding-left:14px;">
          <div style="font-size:76px;font-weight:800;color:${COLOURS.green};line-height:1;">${dish.portions}</div>
          <div style="font-size:20px;color:#888;text-transform:uppercase;letter-spacing:.06em;">portions</div>
        </div>
      </div>
      <div style="font-size:20px;color:#666;margin-bottom:11px;">${dish.ordered} ordered${dish.buffer ? ` + ${dish.buffer} buffer` : ''} &middot; ${dish.dishLabelSheets} label sheet${dish.dishLabelSheets === 1 ? '' : 's'}</div>
      <table style="width:100%;border-collapse:collapse;flex:1;">${rows}</table>
    </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8">
<title>prepcuisines station labels — ${escapeHtml(sheet.dateLabel)}</title>
<style>
  @page { size: 4in 6in; margin: 0; }
  body { margin:0; padding:0; }
  @media print { #printBtn { display:none !important; } * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head>
<body>
<div id="printBtn" style="position:fixed;bottom:20px;right:20px;z-index:99;">
  <button onclick="window.print()" style="background:${COLOURS.gold};color:${COLOURS.green};border:none;border-radius:8px;padding:14px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.3);">Print labels</button>
</div>
${pages || '<p style="font-family:Arial,sans-serif;padding:24px;">Nothing to print for this day.</p>'}
</body></html>`;
}

/* ── Opening the print window ──────────────────────────────────────────── */

export function openPrintWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
