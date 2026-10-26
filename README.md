# Commercial Restaurant POS & SEFAZ Invoicing Engine

A high-reliability, 24/7 commercial Point of Sale (POS), electronic invoicing, and food ordering backend built with **Node.js (ESM)** and **native SQLite (WAL mode)**.

Currently powering live retail and restaurant operations at **[softcore.cloud](https://softcore.cloud)**.

---

## 🏛️ System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │           Linux Ubuntu Server (VPS)          │
                  │   Cloudflare Zero Trust Tunnel + Nginx Proxy │
                  └──────────────────────┬───────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │        Node.js Core Server (server.mjs)   │
                   ├───────────────────────────────────────────┤
                   │  • Fiscal Core (NFC-e / NF-e 55 Engine)   │
                   │  • SEFAZ SOAP Connectors & Protocol Core  │
                   │  • Cashier & Till Management (Caixa)      │
                   │  • Waiter & KDS State Synchronization     │
                   │  • ESC/POS Thermal Print Job Queue        │
                   └─────────────────────┬─────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │       SQLite with WAL Persistence         │
                   │  • PRAGMA synchronous = FULL / NORMAL     │
                   │  • Automated hot backup daemon (Systemd)  │
                   │  • SHA-256 integrity checks (quick_check) │
                   └───────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 1. Government Fiscal Invoicing (NFC-e & NF-e 55)
- **Direct SEFAZ Integration (`lib/sefaz-connectors.mjs`):** Asynchronous communication directly with Brazilian tax authority (SEFAZ) web services via SOAP 1.2 protocols.
- **XML Cryptography (`lib/fiscal-core.mjs`):** Canonicalization, digest generation, and RSA-SHA1 digital signature generation using X.509 A1 PKCS#12 digital certificates (`node-forge`, `xml-crypto`).
- **DANFE & QR-Code Generation:** Automated generation of consumer fiscal receipts (DANFE Simplificada) and SEFAZ validation QR codes (`qrcode`).

### 2. POS Cashier & Kitchen Operations
- **Cashier Management (`lib/cashier-core.mjs`):** Shift opening, closing, cash balancing, audit logging, and payment verification (PIX, Credit/Debit, Cash with change calculation).
- **Waiter & KDS Sync (`garcom/`):** Real-time mobile interface for waitstaff with table management, item notes, and instant kitchen ticket emission.
- **Atomic Stock Control (`lib/stock-core.mjs`):** Automatic inventory deduction on confirmed orders and automatic replenishment upon cancellations.

### 3. Desktop Hardware Bridge (Thermal Receipt Printers)
- **Cloud-to-Hardware Queue:** Serves an authenticated print job queue (`/api/print-agent/jobs/*`) consumed by the native C# [.NET Print Agent](https://github.com/rikelmi12/pos-thermal-print-agent).
- **Atomic Claiming:** Prevents duplicate thermal ticket printing via token-authenticated lease claims (`X-Print-Agent-Token`).

### 4. Edge Security & Reliability
- **Zero Exposed Inbound Ports:** Traffic routed securely via Cloudflare Tunnels (`cloudflared`).
- **Hardened Nginx Proxy:** Strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), and IP rate limiting on all public write endpoints.
- **Zero-Downtime Hot Backups:** Automated systemd backup scripts generating consistent SQLite snapshots with SHA-256 validation (`PRAGMA quick_check`).

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (>= 22.5.0 with native `node:sqlite`)
- **Persistence:** SQLite 3 with Write-Ahead Logging (WAL)
- **Fiscal Cryptography:** `node-forge`, `xml-crypto`, `@xmldom/xmldom`, `qrcode`
- **Reverse Proxy & Edge:** Nginx, Cloudflare Zero Trust Tunnels, Let's Encrypt SSL/TLS
- **Frontend / Clients:** Vanilla ES6+, CSS Modern Grid/Flexbox, Progressive Web App (PWA) with Service Workers

---

## 🏁 Getting Started

### Prerequisites

- Node.js 22.5.0+ installed.

### Setup

```bash
# 1. Clone repository
git clone https://github.com/rikelmi12/softcore-pos-engine.git
cd softcore-pos-engine

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your local secrets

# 4. Start the server
npm start
# Server listening on http://localhost:8000
# Admin panel accessible at http://localhost:8000/admin/
```

---

## 📄 License

This software is released under the [MIT License](LICENSE).
