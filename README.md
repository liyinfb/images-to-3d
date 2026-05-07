# 3D Reconstructor

An AI-powered web application that transforms 2D photographs into interactive 3D models. Upload one or more images of an object and the system generates a detailed 3D mesh you can explore from every angle and download in GLB format.

---

## Screenshots

| Homepage | Reconstruction Page |
|----------|-------------------|
| ![Homepage](/manus-storage/screenshot_homepage_4afc04f5.webp) | ![Reconstruct](/manus-storage/screenshot_reconstruct_c8266011.webp) |

| History | 3D Viewer |
|---------|-----------|
| ![History](/manus-storage/screenshot_history_e918896c.webp) | ![Viewer](/manus-storage/screenshot_viewer_d02fdeaa.webp) |

---

## Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Reconstruction** | Uses TRELLIS, TripoSG, and Stable Fast 3D models via HuggingFace Spaces for image-to-3D generation |
| **Multi-View Support** | Upload up to 8 images from different angles for significantly better reconstruction quality |
| **Interactive 3D Viewer** | Built with Three.js and React Three Fiber for real-time model inspection with orbit controls |
| **GLB Export** | Download models in GLB format, compatible with Blender, Unity, Unreal Engine, and other 3D tools |
| **Reconstruction History** | All past jobs are saved and accessible with status tracking, timestamps, and source images |
| **Multi-Backend Fallback** | Automatic failover chain (TripoSG → SF3D → frogleo → TRELLIS) ensures high availability |
| **OAuth Authentication** | Secure user authentication via Manus OAuth |
| **Responsive Design** | Works on desktop, tablet, and mobile devices |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, React Three Fiber, Framer Motion |
| **Backend** | Express 4, tRPC 11, Node.js 22 |
| **Database** | MySQL (TiDB compatible) via Drizzle ORM |
| **Storage** | AWS S3 for model and image storage |
| **3D Processing** | Three.js, GLTFLoader, Sharp (image processing) |
| **Testing** | Vitest |
| **Build** | Vite 7, esbuild |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (React)                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Upload  │  │  3D Viewer   │  │   History / Gallery   │  │
│  │  (drag&  │  │ (Three.js +  │  │  (job list + status)  │  │
│  │   drop)  │  │  OrbitCtrl)  │  │                       │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ tRPC (HTTP batch)
┌─────────────────────────▼───────────────────────────────────┐
│                     Server (Express + tRPC)                   │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│  │   Routers    │  │ Reconstruction │  │   Storage (S3)  │  │
│  │  (auth, job  │  │  (multi-backend│  │  (images, GLB)  │  │
│  │   CRUD)     │  │   fallback)    │  │                 │  │
│  └──────────────┘  └────────┬───────┘  └─────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │   HuggingFace Spaces (GPU)    │
              │  TripoSG → SF3D → frogleo →  │
              │         TRELLIS               │
              └───────────────────────────────┘
```

---

## Project Structure

```
3d-reconstructor/
├── client/                   # Frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ModelViewer.tsx    # Three.js 3D model viewer
│   │   │   ├── ImageUploader.tsx  # Drag-and-drop image upload
│   │   │   └── Navbar.tsx         # Navigation bar
│   │   ├── pages/            # Route-level pages
│   │   │   ├── Home.tsx           # Landing page
│   │   │   ├── Reconstruct.tsx    # Reconstruction workflow
│   │   │   └── History.tsx        # Past jobs gallery
│   │   ├── lib/trpc.ts       # tRPC client binding
│   │   └── App.tsx           # Routes and layout
│   └── index.html
├── server/                   # Backend application
│   ├── _core/                # Framework plumbing (OAuth, context, etc.)
│   ├── reconstruction.ts     # Multi-backend 3D reconstruction service
│   ├── routers.ts            # tRPC procedures
│   ├── db.ts                 # Database query helpers
│   └── storage.ts            # S3 storage helpers
├── drizzle/                  # Database schema and migrations
│   └── schema.ts             # Table definitions
├── shared/                   # Shared types and constants
├── docker-compose.yml        # Local development with Docker
├── Dockerfile                # Production container image
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** 22+ (LTS recommended)
- **pnpm** 10+ (package manager)
- **MySQL** 8.0+ (or TiDB-compatible database)
- **AWS S3** bucket (or S3-compatible storage like MinIO)

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/reconstructor

# Authentication
JWT_SECRET=your-secret-key-here
VITE_APP_ID=your-manus-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im/app-auth

# Owner info
OWNER_OPEN_ID=your-open-id
OWNER_NAME=your-name

# Manus Forge API (for AI image generation)
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=your-forge-api-key

# Frontend Forge access
VITE_FRONTEND_FORGE_API_KEY=your-frontend-forge-key
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im

# S3 Storage (set by platform, or configure manually)
S3_BUCKET=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

### Local Installation

```bash
# Clone the repository
git clone <repository-url>
cd 3d-reconstructor

# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Production Build

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

---

## Docker Compose (Local Development)

The easiest way to run the full stack locally is with Docker Compose. This sets up the application, a MySQL database, and a MinIO S3-compatible storage service.

### Quick Start

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your API keys (BUILT_IN_FORGE_API_KEY, JWT_SECRET, etc.)

# Start all services
docker compose up -d

# Push database schema (first time only)
docker compose exec app pnpm db:push

# View logs
docker compose logs -f app
```

The application will be available at **http://localhost:3000**.

### Services

| Service | Port | Description |
|---------|------|-------------|
| `app` | 3000 | 3D Reconstructor application |
| `db` | 3306 | MySQL 8.0 database |
| `minio` | 9000 / 9001 | MinIO S3-compatible storage (API / Console) |

### Stopping

```bash
# Stop all services (preserves data)
docker compose down

# Stop and remove all data volumes
docker compose down -v
```

---

## API Reference

The backend exposes tRPC procedures under `/api/trpc`. Key endpoints:

| Procedure | Type | Description |
|-----------|------|-------------|
| `auth.me` | Query | Get current authenticated user |
| `auth.logout` | Mutation | Log out the current user |
| `reconstruction.create` | Mutation | Start a new 3D reconstruction job |
| `reconstruction.status` | Query | Poll job status and progress |
| `reconstruction.history` | Query | List user's past reconstruction jobs |

---

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Type check
pnpm check
```

---

## License

MIT
