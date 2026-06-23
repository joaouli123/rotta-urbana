// Dynamic Expo config.
// Inherits everything from app.json and adds the image-picker permission strings.
//
// The Mapbox SECRET download token (build-time only) is provided via the
// RNMAPBOX_MAPS_DOWNLOAD_TOKEN environment variable (an EAS secret), which the
// @rnmapbox/maps native build reads directly — so the token is never written to
// gradle.properties or committed to the repo.
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    // Explicit Info.plist strings (belt-and-suspenders alongside the plugins),
    // so reviewers always see clear, localized purpose strings.
    infoPlist: {
      ...(config.ios?.infoPlist ?? {}),
      NSLocationWhenInUseUsageDescription:
        'O Rotta Urbana usa sua localização para mostrar motoristas próximos e traçar rotas.',
      NSCameraUsageDescription:
        'O Rotta Urbana usa a câmera para a selfie de verificação e o envio de documentos do motorista.',
      NSPhotoLibraryUsageDescription:
        'O Rotta Urbana acessa suas fotos para enviar documentos do motorista e anexos de suporte.',
      // App uses only standard/exempt encryption (HTTPS) — skips the export-compliance prompt.
      ITSAppUsesNonExemptEncryption: false,
      // Let iOS wake the app for incoming ride push notifications when backgrounded.
      UIBackgroundModes: ['remote-notification'],
    },
  },
  plugins: [
    '@rnmapbox/maps',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'O Rotta Urbana usa sua localização para mostrar motoristas próximos e traçar rotas.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'O Rotta Urbana acessa suas fotos para enviar documentos do motorista.',
        cameraPermission: 'O Rotta Urbana usa a câmera para a selfie de verificação do motorista.',
      },
    ],
    'expo-font',
    'expo-audio',
    [
      'expo-notifications',
      {
        color: '#C1F11D',
        // Bundle the loud alert as a custom notification sound so a new ride
        // rings strongly even when the driver's app is fully closed (the
        // 'rides-v2' Android channel + push payload reference 'request.wav').
        sounds: ['./assets/sounds/request.wav'],
      },
    ],
  ],
});
