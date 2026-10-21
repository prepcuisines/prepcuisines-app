'use client'

import { useState } from 'react'

// Small (i) button that opens the full ingredient list for one dish.
// Always shown; until a dish has ingredients saved in admin it says they are on request.
export default function IngredientsInfo({ name, ingredients }: { name: string; ingredients?: string | null }) {
  const [open, setOpen] = useState(false)
  const text = (ingredients || '').trim()
  return (
    <div style={{ margin: '4px 0 8px' }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Ingredients for ${name}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
          fontSize: 13,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '1.5px solid currentColor',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            fontStyle: 'italic',
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
          }}
        >
          i
        </span>
        <span style={{ textDecoration: 'underline' }}>Ingredients</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Ingredients for ${name}`}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              color: '#1a2e1a',
              borderRadius: 14,
              padding: '20px 22px',
              maxWidth: 420,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              fontSize: 14,
              lineHeight: 1.55,
              textAlign: 'left',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
              <strong style={{ fontSize: 16, lineHeight: 1.3 }}>{name}</strong>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'inherit', padding: 0 }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>Ingredients</div>
            <div>{text || 'We\'re adding the full ingredient list for this dish. Message us and we\'ll send it to you straight away.'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
