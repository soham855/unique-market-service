import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.uniquemarket.instantservices',
  appName: 'Instant Services for Your Security',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
