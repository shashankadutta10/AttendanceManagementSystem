import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { attendanceBackendPlugin } from './backend/index.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), attendanceBackendPlugin()],
  server: {
    host: true, // Listen on all network interfaces so iOS/Android devices connect directly
    port: 5173,
    https: true, // Enables HTTPS required by iOS Safari and Android Chrome for Geolocation & Camera
    allowedHosts: true, // Allow all hosts and IP addresses without Host header blocks
    cors: true,
    watch: {
      ignored: ['**/data/**'],
    },
  },
  preview: {
    host: true,
    port: 5173,
    https: true,
    allowedHosts: true,
    cors: true,
  },
})
