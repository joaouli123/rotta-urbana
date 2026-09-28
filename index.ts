import { registerRootComponent } from 'expo';

import App from './App';
// Defines the driver's background location task at startup.
import './src/services/liveLocation';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
