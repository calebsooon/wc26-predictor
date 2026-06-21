'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { reportTelemetry } from '@/lib/telemetry'

export default function Telemetry() {
  useReportWebVitals((metric) => {
    reportTelemetry({ type: 'web_vital', name: metric.name, value: Math.round(metric.value), path: window.location.pathname })
  })
  return null
}
