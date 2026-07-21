import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { persistStationTicketIntent } from './lib.ts'

// Capture a scanned station QR intent (?lab=..&station=..) before React mounts,
// so it survives the sign-up email-confirmation redirect that strips the URL.
persistStationTicketIntent()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
