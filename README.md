# VN CRM

A professional Client Relationship Management system built with **React + TypeScript + Firebase**.

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd vn-crm-2
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Enable **Authentication** → Email/Password sign-in method.
3. Enable **Firestore Database** (start in production mode).
4. Enable **Storage** (requires Blaze plan for voice/document uploads).
5. Copy your project config.

### 3. Environment Variables

Create a `.env` file (copy `.env.example`):

```bash
cp .env.example .env
```

Fill in your Firebase values:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Create Your First Admin

Since there's no UI for the very first admin, create them manually:

1. In Firebase Console → **Authentication** → Add User (email/password).
2. Copy the UID shown after creation.
3. In Firebase Console → **Firestore** → Create collection `users` → Add document with the UID as the document ID:

```json
{
  "name": "Super Admin",
  "email": "admin@company.com",
  "role": "admin",
  "status": "active",
  "phone": "",
  "createdAt": (timestamp)
}
```

4. You can now log in and use the Admin Panel to create more admins/agents.

### 5. Deploy Firestore Rules

In Firebase Console → Firestore → **Rules** tab, paste the contents of `firestore.rules`.

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🏗️ Architecture

```
src/
├── contexts/          # React context (Auth)
├── components/
│   ├── Layout/        # Sidebar, Header, AppLayout
│   ├── ClientTable/   # Table, Filters
│   └── ui/            # Shared primitives
├── hooks/             # useInactivity, useNotifications
├── lib/               # Firebase, Firestore, Storage helpers
├── pages/
│   ├── admin/         # Admin, Agent, ActivityLog pages
│   └── ...            # Login, Dashboard, Client, Summary pages
├── router/            # React Router v6 configuration
└── types/             # TypeScript interfaces
```

## ⚙️ Features

| Feature | Status |
|---|---|
| Firebase Authentication | ✅ |
| Role-based access (Admin/Agent) | ✅ |
| Auto-logout (10 min inactivity) | ✅ |
| Session warning modal (at 9 min) | ✅ |
| Client management (CRUD) | ✅ |
| WhatsApp number validation | ✅ |
| Existing client detection | ✅ |
| Profile image upload | ✅ |
| Call summary with voice + docs | ✅ |
| Payment tracking | ✅ |
| Agent assignment & reassignment | ✅ |
| Real-time notifications | ✅ |
| Activity audit logs | ✅ |
| Admin/Agent management | ✅ |
| Search & filters | ✅ |
| Pagination | ✅ |
| Responsive design | ✅ |
| Dark mode design | ✅ |

## 🔒 Security

- Firestore security rules enforce role-based access at the database level.
- Admins can access all data; agents can only see their assigned clients.
- Summaries are write-once (no updates after creation).
- Activity logs are immutable.

## 📱 Tech Stack

- **React 18** + **TypeScript** (strict mode)
- **Vite** build tool
- **Firebase** (Auth, Firestore, Storage)
- **React Router v6** with nested routes
- **react-hook-form** + **zod** validation
- **react-hot-toast** notifications
- **lucide-react** icons
- **date-fns** date formatting
- **react-dropzone** file uploads
