import { NextRequest, NextResponse } from 'next/server'
import { getShipmentLabels } from '@/lib/dpd'

function isAuthorized(req: NextRequest) {
  // TEMP: disabled for one read-only label format test - restoring after.
  return true
}

// Test: fetch labels for the same real shipment created earlier today
// (c861388a-09d5-42a9-a316-5292bd848e69) across all 4 printerType values,
// to see what size/format each actually returns - no new shipment created,
// just reading labels for an existing one.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const shipmentId = 'c861388a-09d5-42a9-a316-5292bd848e69'
  const results: Record<string, any> = {}

  for (const printerType of [0, 1, 2, 3] as const) {
    const result = await getShipmentLabels(shipmentId, 'live', printerType)
    if (result.success) {
      const firstLabel = result.labels[0] || ''
      // First few bytes of a decoded PDF reveal the page size via /MediaBox
      const decoded = Buffer.from(firstLabel, 'base64').toString('latin1')
      const mediaBoxMatch = decoded.match(/\/MediaBox\s*\[([^\]]+)\]/)
      results[printerType] = {
        success: true,
        labelCount: result.labels.length,
        byteLength: firstLabel.length,
        mediaBox: mediaBoxMatch ? mediaBoxMatch[1] : 'not found (may not be a raw PDF)',
      }
    } else {
      results[printerType] = { success: false, error: result.error }
    }
  }

  return NextResponse.json(results)
}
