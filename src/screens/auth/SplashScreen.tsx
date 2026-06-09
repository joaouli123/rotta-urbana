import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Zap } from 'lucide-react-native';
import { Colors } from '../../constants';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(subtitleAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(progressAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
    ]).start(() => {
      setTimeout(onFinish, 300);
    });
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <LinearGradient
      colors={['#0A0A0A', '#1A0A00', '#0A0A0A']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background dots */}
      {Array.from({ length: 20 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              left: Math.random() * width,
              top: Math.random() * height,
              opacity: Math.random() * 0.15 + 0.05,
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
            },
          ]}
        />
      ))}

      <Animated.View
        style={[
          styles.logoContainer,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
      >
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          style={styles.logoBox}
        >
          <MapPin size={36} color="#fff" strokeWidth={2.5} />
          <Zap size={20} color="#fff" style={styles.zapIcon} />
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[styles.textContainer, { opacity: subtitleAnim }]}>
        <Text style={styles.brandName}>ROTTA URBANA</Text>
        <Text style={styles.tagline}>Seu destino, nossa rota</Text>
      </Animated.View>

      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
      </View>

      <Text style={styles.version}>v1.0.0</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logoBox: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 16,
  },
  zapIcon: {
    position: 'absolute',
    bottom: 14,
    right: 14,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 64,
  },
  brandName: {
    fontSize: 30,
    fontFamily: 'Poppins_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary,
    marginTop: 6,
    letterSpacing: 1,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 80,
    width: 160,
    height: 3,
    backgroundColor: Colors.card,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  version: {
    position: 'absolute',
    bottom: 40,
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted,
  },
});

export default SplashScreen;
