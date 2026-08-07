'use client'

import { useMemo, useState } from 'react'

import {
  DEFAULT_BUFFER,
  DISH_LABELS_PER_SHEET,
  LOGO_LABELS_PER_SHEET,
  STICKER_BG,
  buildCookSheet,
  cookSheetToText,
  formatWeight,
} from '../../lib/cook-sheet/calculate'
import { openPrintWindow, renderCookSheetHtml, renderLabelsHtml } from '../../lib/cook-sheet/print'
import { CATEGORY_LABEL } from '../../lib/cook-sheet/recipes'

type Props = {
  /**
   * Per-dish tally for the selected delivery day — pass `cookSheetForKey`
   * straight through, it's already the right shape.
   */
  tally: { name: string; qty: number }[]
  /** e.g. "Sunday (w/c 09/08/2026)" — used in headings and the printout. */
  dateLabel: string
  /** Used for the download filename. */
  dateKey?: string
}

export default function CookSheetBreakdown({ tally, dateLabel, dateKey }: Props) {
  const [buffer, setBuffer] = useState(DEFAULT_BUFFER)
  const [includeBreakfast, setIncludeBreakfast] = useState(true)
  const [includeDesserts, setIncludeDesserts] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const sheet = useMemo(
    () =>
      buildCookSheet(
        tally.map((d) => ({ name: d.name, quantity: d.qty })),
        dateLabel,
        { buffer, includeBreakfast, includeDesserts }
      ),
    [tally, dateLabel, buffer, includeBreakfast, includeDesserts]
  )

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const copyFullSheet = () => {
    navigator.clipboard
      .writeText(cookSheetToText(sheet))
      .then(() => flash('Full cook sheet copied.'))
      .catch(() => flash('Could not copy — use Download instead.'))
  }

  const downloadFullSheet = () => {
    const blob = new Blob([cookSheetToText(sheet)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cook-sheet-full-${dateKey || dateLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const print = (html: string) => {
    if (!openPrintWindow(html)) flash('Allow pop-ups for this site to print.')
  }

  if (!tally.length) return null

  return (
    <>
      <div className="insights-block">
        <div className="insights-block-header">
          <h2 className="insights-block-title">Ingredients &amp; shopping — {dateLabel}</h2>
          <div className="cook-sheet-actions">
            <button className="segment-pill" onClick={copyFullSheet}>
              Copy full sheet
            </button>
            <button className="segment-pill" onClick={downloadFullSheet}>
              Download
            </button>
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => print(renderCookSheetHtml(sheet))}>
              Print cook sheet
            </button>
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => print(renderLabelsHtml(sheet))}>
              Print station labels
            </button>
          </div>
        </div>

        <p className="map-intro">
          Scales each dish&apos;s recipe by the number of portions you&apos;re cooking, then rolls
          everything up into shopping lists and label counts. Weights are raw unless marked cooked.
        </p>

        <div className="toolbar">
          <label className="field-label" htmlFor="cs-buffer" style={{ marginBottom: 0 }}>
            Spare portions per dish
          </label>
          <input
            id="cs-buffer"
            type="number"
            min={0}
            max={20}
            className="text-input"
            style={{ width: 80 }}
            value={buffer}
            onChange={(e) => setBuffer(Math.max(0, Number(e.target.value) || 0))}
          />
          <button
            className={`segment-pill ${includeBreakfast ? 'segment-pill-active' : ''}`}
            onClick={() => setIncludeBreakfast((v) => !v)}
          >
            Breakfast {includeBreakfast ? 'on' : 'off'}
          </button>
          <button
            className={`segment-pill ${includeDesserts ? 'segment-pill-active' : ''}`}
            onClick={() => setIncludeDesserts((v) => !v)}
          >
            Desserts {includeDesserts ? 'on' : 'off'}
          </button>
        </div>

        {notice && (
          <p className="map-intro" role="status">
            {notice}
          </p>
        )}

        <div className="stat-grid">
          <StatBox label="Ordered" value={sheet.totalOrdered} />
          <StatBox label="Portions to cook" value={sheet.totalPortions} accent />
          <StatBox label="Dishes" value={sheet.dishes.length} />
          <StatBox label="Dish label sheets" value={sheet.totalDishLabelSheets} />
        </div>

        {sheet.unmatched.length > 0 && (
          <div className="empty-panel" style={{ borderStyle: 'solid', borderColor: '#f0c9c2', background: '#fff5f4' }}>
            <strong style={{ color: '#a3402f' }}>
              No recipe for {sheet.unmatched.length} dish{sheet.unmatched.length === 1 ? '' : 'es'}
            </strong>{' '}
            — these aren&apos;t scaled or included in the shopping list below:{' '}
            {sheet.unmatched.map((u) => `${u.name} (${u.quantity})`).join(', ')}. Add them to{' '}
            <code>lib/cook-sheet/recipes.ts</code> and redeploy.
          </div>
        )}
      </div>

      {sheet.dishes.map((dish) => (
        <div className="insights-block" key={dish.recipe.name}>
          <div className="insights-block-header">
            <h3 className="ops-subtitle" style={{ margin: 0 }}>
              {dish.recipe.name}
            </h3>
            <div className="cook-sheet-actions" style={{ alignItems: 'center' }}>
              {dish.recipe.stickerColour !== 'n/a' && (
                <span
                  className="pill"
                  style={{ background: STICKER_BG[dish.recipe.stickerColour], color: '#fff' }}
                >
                  {dish.recipe.stickerColour}
                </span>
              )}
              <span className="pill pill-muted">{CATEGORY_LABEL[dish.recipe.cat]}</span>
              <span className="pill pill-active">
                {dish.portions} portions ({dish.ordered} ordered
                {dish.buffer ? ` + ${dish.buffer}` : ''})
              </span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Per portion</th>
                  <th>Total for {dish.portions}</th>
                </tr>
              </thead>
              <tbody>
                {dish.lines.map((line) => (
                  <tr key={line.name}>
                    <td>
                      {line.name}
                      {line.isMeat && ' 🥩'}
                    </td>
                    <td className="num nowrap">
                      {line.rawPerPortion}g
                      {line.cookedPerPortion !== null && ` → ${line.cookedPerPortion}g cooked`}
                    </td>
                    <td className="num nowrap">
                      {formatWeight(line.totalRaw)}
                      {line.totalCooked !== null && ` → ${formatWeight(line.totalCooked)} cooked`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {sheet.shopping.map((section) => (
        <div className="insights-block" key={section.key}>
          <h3 className="ops-subtitle" style={{ marginTop: 0 }}>
            {section.title}
          </h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Buy</th>
                </tr>
              </thead>
              <tbody>
                {section.lines.map((line) => (
                  <tr key={line.name}>
                    <td>
                      {line.isMeat && '🥩 '}
                      {line.name}
                    </td>
                    <td className="num nowrap">{formatWeight(line.totalGrams)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="insights-block">
        <h3 className="ops-subtitle" style={{ marginTop: 0 }}>
          Labels
        </h3>
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Sticker colour</th>
                <th>Portions</th>
                <th>Logo sheets ({LOGO_LABELS_PER_SHEET}/sheet)</th>
              </tr>
            </thead>
            <tbody>
              {sheet.colourLabels.map((row) => (
                <tr key={row.colour}>
                  <td>
                    <span className="pill" style={{ background: STICKER_BG[row.colour], color: '#fff' }}>
                      {row.colour}
                    </span>
                  </td>
                  <td className="num">{row.portions}</td>
                  <td className="num">{row.sheets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="map-intro">
          Dish labels: {sheet.totalDishLabels} needed — {sheet.totalDishLabelSheets} sheet
          {sheet.totalDishLabelSheets === 1 ? '' : 's'} at {DISH_LABELS_PER_SHEET} per sheet.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Portions</th>
                <th>Sheets</th>
              </tr>
            </thead>
            <tbody>
              {sheet.dishes.map((dish) => (
                <tr key={dish.recipe.name}>
                  <td>{dish.recipe.name}</td>
                  <td className="num">{dish.portions}</td>
                  <td className="num">{dish.dishLabelSheets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}
