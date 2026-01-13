# Deployment Guide

## Deploy to Netlify

### 1. Environment Variables

In your Netlify site settings, add these environment variables:

```
VITE_SUPABASE_URL=https://viageoznoxgyplkkenao.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpYWdlb3pub3hneXBsa2tlbmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDk4NzgsImV4cCI6MjA3ODk4NTg3OH0.7Pz2Sh81VSpt0cFlgtDnNBX96UzEKtV3eOnkVMucl7Q
```

### 2. Build Settings

The `netlify.toml` file is already configured with:
- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **SPA redirects:** Configured for client-side routing

### 3. Deploy Options

#### Option A: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

#### Option B: Git Integration
1. Push code to GitHub/GitLab/Bitbucket
2. Connect repository in Netlify dashboard
3. Configure environment variables
4. Deploy automatically on push

#### Option C: Netlify Drop
1. Build locally: `npm run build`
2. Drag and drop the `dist` folder to: https://app.netlify.com/drop

### 4. Post-Deployment

After deployment:
1. Create an admin user using the Supabase Edge Function
2. Log in with admin credentials
3. Configure stores and invite users

### Admin User Creation

Use this curl command (replace YOUR_NETLIFY_URL):

```bash
curl -X POST https://YOUR_NETLIFY_URL/.netlify/functions/create-admin-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!",
    "full_name": "Administrator"
  }'
```

## Alternative Deployment Platforms

### Vercel
```bash
npm install -g vercel
vercel --prod
```

### Cloudflare Pages
Connect your Git repository and deploy with:
- Build command: `npm run build`
- Output directory: `dist`

### AWS Amplify
Connect your repository and use:
- Build command: `npm run build`
- Output directory: `dist`
