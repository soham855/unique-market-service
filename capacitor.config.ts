import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.uniquemarket.service',
  appName: 'Unique Market',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
