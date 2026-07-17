# VAMS Standalone Admin Dashboard (React + NestJS + PostgreSQL)

This folder contains the standalone web application architecture for the **Vehicle Alert Management System (VAMS) Universal Admin Dashboard**. It is kept completely separate from the core VAMS repository to ensure modularity, independent deployment, and clean architecture.

---

## 1. Project Directory Structure

```
VAMS-Admin-Dashboard/
├── README.md                     # This architecture & prompt specification
├── vams-admin-backend/           # Standalone NestJS REST API
└── vams-admin-frontend/          # Standalone React + Vite + TypeScript Client
```

---

## 2. Core Functional Requirements

The VAMS Admin Dashboard is a multi-tenant management portal built using **NestJS**, **React (TypeScript)**, and **PostgreSQL**. It allows super-administrators and company-administrators to monitor metrics, handle licensing, dispatch manual alerts, and control notifications.

### A. Multi-Tenant Tracking & Telemetry
1. **Global Company Matrix**:
   - Super Admins can monitor all registered companies (e.g. Tata Company, Mahindra, etc.).
   - Track total users, active connections, and historical statistics per company.
2. **Defect Lifecycle Metrics**:
   - Track defect performance metrics per user and per company:
     - **Open Defects**: Count of defects currently awaiting worker inspection.
     - **Resolved Defects**: Count of completed tasks.
     - **Reopened Defects**: Count of recurring defects sent back to the floor.
     - **Reassigned Defects**: Frequency of ticket handovers/reassignments.
3. **Dynamic Distribution**:
   - Render real-time visual distributions grouping defects by category (e.g. brakes, engine, chassis) and severity (INFO to EMERGENCY).

### B. Manual Defect Dispatch Panel
* **No Operator Defect Creation**: Manual defect creation is blocked on the main operator app, restricting manual dispatches solely to the Admin Dashboard.
* **Dispatcher Interface**:
   - Select a company tenant (Super Admin) or lock to current company (Company Admin).
   - Enter Vehicle Identification Number (VIN), select defect definition, and assign to a specific active employee.
   - **Boundary Enforcer**: Validation checks must confirm that manual alerts can *only* be dispatched to users belonging to the same company.

### C. WhatsApp & Siren Warning Alerts
1. **Action Notifications**:
   - Send WhatsApp alerts immediately upon defect creation, assignment, comment additions, and resolution updates.
2. **2-Hour Unresolved Reminders**:
   - A background scheduler must run periodically (every 10 minutes) querying active alerts that have remained unresolved for 2+ hours.
   - For matching alerts, trigger repeat push notifications requesting the emergency sound profile (`siren.wav` / `siren.mp3`) and dispatch recurring WhatsApp alerts:
     - *"ALERT: Defect '{Defect}' on VIN {VIN} is unresolved. Immediate resolution required."*

### D. Licensing Policies & Role Lockdowns
* **User Limits**: Configure maximum active user caps per company (e.g. 1 user for Tata, 3 users for Mahindra). Block registrations if limits are reached.
* **Role Lockdowns**: Whitelist permitted roles for each company (e.g. allow only FACTORY_MANAGER / MANAGER, or allow WORKER, SUPERVISOR, etc.). Rejects sign-ups of non-whitelisted roles.

---

## 3. Database Schema Specification (PostgreSQL + Prisma)

Configure a separate PostgreSQL instance for the admin dashboard. The schema should define:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Company {
  id              String           @id @default(uuid())
  name            String           @unique
  isActive        Boolean          @default(true)
  settings        CompanySettings?
  users           User[]
  alerts          Alert[]
  createdAt       DateTime         @default(now())
}

model CompanySettings {
  id                 String     @id @default(uuid())
  companyId          String     @unique
  soundEmergency     String     @default("siren.mp3")
  maxUsers           Int        @default(0)       // 0 = unlimited
  allowedRoles       String[]   @default([])      // Whitelisted user roles
  whatsappEnabled    Boolean    @default(false)
  whatsappApiKey     String?
  whatsappSenderNum  String?
  company            Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
}

model User {
  id           String   @id @default(uuid())
  email        String
  name         String
  role         String
  isActive     Boolean  @default(true)
  companyId    String
  company      Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, email])
}

model Alert {
  id                 String      @id @default(uuid())
  vin                String
  companyId          String
  defectName         String
  severity           String      @default("MEDIUM")
  status             String      @default("OPEN") // OPEN, IN_PROGRESS, RESOLVED, REOPENED
  assignedToUserId   String?
  createdById        String?
  isManual           Boolean     @default(true)
  lastReminderSentAt DateTime?
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  company            Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
}
```

---

## 4. UI/UX Design System Guidelines

The React dashboard application should incorporate high-end design aesthetics:
* **Typography**: Modern typography from Google Fonts (`Outfit` for title headers, `Inter` for layout body text).
* **Color System**: Clean, tailored HSL color tokens utilizing dark theme panels and glowing gradients (primary blue `#2563eb` through purple `#8b5cf6`).
* **Glassmorphism**: Layouts using `backdrop-filter: blur(16px)` and translucent card borders for a premium, clean look.
* **Component Grid**:
  - **Login gateway**: Multi-tenant authorization interface.
  - **Super Admin policy panels**: Access control checks, license user caps, allowed roles checklists, and WhatsApp toggles.
  - **Metrics panels**: Cards with dynamic SVG data distributions (category & severity grids).
  - **Floor dispatcher form**: Manual alert creations.
  - **Audit grid**: Historical scrollable timelines tracing all actions.
