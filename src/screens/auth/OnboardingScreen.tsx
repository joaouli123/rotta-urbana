import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Animated,
  StatusBar,
} from 'react-native';
import { ChevronRight, ArrowRight } from 'lucide-react-native';
import {
  IllustrationOrder,
  IllustrationCar,
  IllustrationCity,
} from '../../components/illustrations/OnboardingIllustrations';
import { Colors, Radius } from '../../constants';

const { width } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    number: '01',
    Illustration: IllustrationOrder,
    title: 'Solicite sua\ncorrida agora',
    description:
      'Peca uma corrida em segundos e acompanhe o motorista chegando em tempo real pelo mapa.',
  },
  {
    id: '2',
    number: '02',
    Illustration: IllustrationCar,
    title: 'Motorista\na caminho',
    description:
      'Motoristas verificados com CNH, selfie e documentos validados chegam ate voce com rapidez.',
  },
  {
    id: '3',
    number: '03',
    Illustration: IllustrationCity,
    title: 'Chegue com\nseguranca',
    description:
      'Tarifa justa, pagamento facil e suporte 24h para passageiros e motoristas em Sinop.',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const currentIndex = useRef(0);

  const goNext = () => {
    if (currentIndex.current < slides.length - 1) {
      currentIndex.current += 1;
      flatListRef.current?.scrollToIndex({ index: currentIndex.current, animated: true });
    } else {
      onComplete();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={onComplete} activeOpacity={0.7}>
        <Text style={styles.skipText}>Pular</Text>
      </TouchableOpacity>

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item }) => {
          const { Illustration } = item;
          return (
            <View style={styles.slide}>
              {/* Step number with underline â€” Freepik style */}
              <View style={styles.numberRow}>
                <Text style={styles.stepNumber}>{item.number}</Text>
                <View style={styles.numberLine} />
              </View>

              {/* SVG Illustration */}
              <View style={styles.illustrationWrap}>
                <Illustration />
              </View>

              {/* Title */}
              <Text style={styles.slideTitle}>{item.title}</Text>

              {/* Description */}
              <Text style={styles.slideDesc}>{item.description}</Text>
            </View>
          );
        }}
      />

      {/* Dots + Action row */}
      <View style={styles.bottomArea}>
        {/* Animated dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity }]}
              />
            );
          })}
        </View>

        {/* Next / Get started button */}
        <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
          <ArrowRight size={24} color={Colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Login link */}
      <TouchableOpacity style={styles.loginLink} onPress={onComplete} activeOpacity={0.7}>
        <Text style={styles.loginText}>
          Ja tem conta?{' '}
          <Text style={styles.loginHighlight}>Entrar</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  skipBtn: {
    position: 'absolute',
    top: 52,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: Colors.textSecondary,
  },

  // â”€â”€ Slide â”€â”€
  slide: {
    width,
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 72,
    paddingBottom: 16,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    gap: 12,
  },
  stepNumber: {
    fontSize: 56,
    fontFamily: 'Poppins_800ExtraBold',
    color: Colors.textPrimary,
    lineHeight: 64,
    includeFontPadding: false,
  },
  numberLine: {
    width: 72,
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    marginTop: 4,
  },
  illustrationWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    marginTop: 4,
  },
  slideTitle: {
    fontSize: 30,
    fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary,
    textAlign: 'left',
    letterSpacing: 0.2,
    lineHeight: 40,
    marginBottom: 12,
  },
  slideDesc: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary,
    textAlign: 'left',
    lineHeight: 25,
    maxWidth: 340,
  },

  // â”€â”€ Bottom â”€â”€
  bottomArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 20,
    paddingTop: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    minWidth: 8,
  },
  nextBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },

  loginLink: {
    alignItems: 'center',
    paddingBottom: 36,
    paddingTop: 4,
  },
  loginText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary,
  },
  loginHighlight: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: Colors.textPrimary,
    textDecorationLine: 'underline',
  },
});

export default OnboardingScreen;
