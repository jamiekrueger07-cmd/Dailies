import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` -> normal site for Vercel/Netlify (dist/)
// `npm run build:preview` -> one self-contained HTML file (dist-preview/) for the clickable preview
export default defineConfig(({ mode }) => ({
  // port 8080 is what Lovable's preview expects
  server: { host: '::', port: 8080 },
  plugins: mode === 'singlefile' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'singlefile' ? { outDir: 'dist-preview' } : { outDir: 'dist' },
}))
