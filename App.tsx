import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[app] render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 28 }}>
          <Text style={{ color: '#111111', fontSize: 21, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
            O app encontrou um problema
          </Text>
          <Text style={{ color: '#555555', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 22 }}>
            Tente carregar novamente. Sua sessão e seus dados continuam protegidos.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#6DC228', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 }}
            onPress={() => this.setState({ error: null })}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#111111', fontSize: 14, fontWeight: '700' }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator color="#6DC228" />
        <Text style={{ marginTop: 12, color: '#555555', fontSize: 14 }}>Carregando o Rotta Urbana...</Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
