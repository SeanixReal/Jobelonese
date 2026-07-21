import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildStationTicketUrl } from "./lib.ts";
import type { Station } from "./lib.ts";

interface StationQrPanelProps {
  labId: number;
  labName?: string;
  station: Station;
}

/**
 * Renders a printable QR code for a single station. The QR encodes a deep link
 * back to TechFix that pre-fills the "Report an issue" form for this exact lab
 * and station — a student scans the sticker on the PC with their phone camera
 * and lands straight on the report form. Fully self-contained so it can be
 * dropped into the IT portal's station pane without touching its logic.
 */
export default function StationQrPanel({ labId, labName, station }: StationQrPanelProps) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  const ticketUrl = buildStationTicketUrl(labId, station.id);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    QRCode.toDataURL(ticketUrl, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError("Could not generate the QR code.");
      });
    return () => {
      active = false;
    };
  }, [open, ticketUrl]);

  const handlePrint = () => {
    if (!dataUrl) return;
    const roomLine = labName ? `${labName} · ` : "";
    const win = window.open("", "_blank", "width=460,height=640");
    if (!win) return;
    // Self-contained print document — safe static values only.
    win.document.write(`<!doctype html>
<html>
<head>
<title>TechFix QR — Station ${station.station_number}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; text-align: center;
         padding: 32px; color: #0f172a; }
  .card { border: 2px solid #0f172a; border-radius: 16px; padding: 28px 24px; max-width: 360px;
          margin: 0 auto; }
  .brand { font-weight: 800; letter-spacing: .04em; color: #1565c0; margin: 0 0 4px; }
  .loc { font-size: 20px; font-weight: 700; margin: 0 0 2px; }
  .room { color: #475569; margin: 0 0 18px; font-size: 14px; }
  img { width: 260px; height: 260px; }
  .cta { margin: 16px 0 0; font-weight: 600; }
  .hint { color: #64748b; font-size: 12px; margin-top: 6px; }
</style>
</head>
<body>
  <div class="card">
    <p class="brand">TechFix · CIT-U</p>
    <p class="loc">Station ${station.station_number}</p>
    <p class="room">${roomLine}Computer Lab Support</p>
    <img src="${dataUrl}" alt="Station QR code" />
    <p class="cta">Scan to report an issue with this PC</p>
    <p class="hint">Point your phone camera at the code</p>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div className="pane-card station-qr-panel">
      <h4>Station QR code</h4>
      {!open ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Show QR code
        </button>
      ) : (
        <div className="station-qr-body">
          {error ? (
            <p className="text-muted">{error}</p>
          ) : dataUrl ? (
            <>
              <img className="station-qr-img" src={dataUrl} alt={`QR code for station ${station.station_number}`} />
              <p className="station-qr-hint text-muted">Scan with a phone to report an issue at this PC.</p>
              <div className="form-row-inline">
                <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
                  Print label
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                  Hide
                </button>
              </div>
            </>
          ) : (
            <p className="text-muted">Generating…</p>
          )}
        </div>
      )}
    </div>
  );
}
