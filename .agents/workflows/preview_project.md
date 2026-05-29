# Preview Project Workflow

This workflow details the step-by-step procedure required to launch and verify the Next.js development server for live previews.

## Steps

### 1. Start Development Server
Start the Turbopack-enabled development server.
```bash
npm run dev
```
*(By default, this server listens on port `9002` as configured in `package.json`.)*

### 2. Verify Local Preview
Open your browser and navigate to the local host address:
- `http://localhost:9002`

## Success Criteria
- The console outputs "Ready in [X]ms" and no fatal boot errors occur.
- Navigating to `http://localhost:9002` displays the landing page without crashing.
