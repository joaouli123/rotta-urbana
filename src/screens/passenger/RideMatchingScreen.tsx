import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Vibration,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Car, Check, Star, Clock } from 'lucide-react-native';
import { Colors, Radius } from '../../constants';

interface RideMatchingScreenProps {
  onDriverFound: () => void;
  onCancel: () => void;
  destinationAddress?: string;
  price?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
}

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.40, 280);
const RING_BASE = 108;

const RideMatchingScreen: React.FC<RideMatchingScreenProps> = ({ onDriverFound, onCancel, destinationAddress, price, distanceKm, durationMin }) => {
  const [phase, setPhase] = useState<'searching' | 'found'>('searching');
  const [dotIdx, setDotIdx] = useState(0);

  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const r3 = useRef(new Animated.Value(0)).current;
  const arcSpin = useRef(new Animated.Value(0)).current;
  const centerPulse = useRef(new Animated.Value(1)).current;

  const foundScale = useRef(new Animated.Value(0)).current;
  const foundOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const driverOpacity = useRef(new Animated.Value(0)).current;
  const driverY = useRef(new Animated.Value(16)).current;

  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);
  const dotTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const findTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeRing = useCallback((anim: Animated.Value, delay: number) => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return loop;
  }, []);

  const triggerFound = useCallback(() => {
    Vibration.vibrate([0, 80, 60, 200, 60, 80]);
    setPhase('found');

    Animated.spring(foundScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    Animated.timing(foundOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();

    setTimeout(() => {
      Animated.spring(checkScale, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }).start();
    }, 220);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(driverOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(driverY, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }, 500);

    findTimer.current = setTimeout(onDriverFound, 3000);
  }, [onDriverFound]);

  useEffect(() => {
    const l1 = makeRing(r1, 0);
    const l2 = makeRing(r2, 570);
    const l3 = makeRing(r3, 1140);
    loopsRef.current = [l1, l2, l3];

    const spinLoop = Animated.loop(
      Animated.timing(arcSpin, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }),
    );
    spinLoop.start();
    loopsRef.current.push(spinLoop);

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(centerPulse, { toValue: 1.1, duration: 720, useNativeDriver: true }),
        Animated.timing(centerPulse, { toValue: 1, duration: 720, useNativeDriver: true }),
      ]),
    );
    breathLoop.start();
    loopsRef.current.push(breathLoop);

    dotTimer.current = setInterval(() => setDotIdx(d => (d + 1) % 3), 480);
    // Fluxo real: a tela só avança quando um MOTORISTA REAL aceitar a corrida
    // (o navegador troca pra tracking via realtime/polling). Sem auto-match falso.

    return () => {
      loopsRef.current.forEach(l => l.stop());
      if (dotTimer.current) clearInterval(dotTimer.current);
      if (findTimer.current) clearTimeout(findTimer.current);
    };
  }, []);

  const ringStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.65, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.9] }) }],
  });

  const arcRotate = arcSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const destText = destinationAddress ? destinationAddress.split(',')[0] : 'Destino';
  const priceText = price != null ? `R$ ${Math.round(price)}` : '—';
  const distText = distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—';
  const etaText = durationMin != null ? `~${durationMin} min` : '—';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#0C1A29', '#122440', '#081420']} style={StyleSheet.absoluteFill} />
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: `${i * 10}%` as any }]} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: `${i * 16.6}%` as any }]} />
      ))}

      {/* Stage — all space above sheet, centered */}
      <View style={[styles.stage, { paddingBottom: SHEET_H }]}>
        {/* Fixed-size bubble so absolute rings center exactly on the circle icon */}
        <View style={styles.animBubble}>
          {phase === 'searching' ? (
            <>
              <Animated.View style={[styles.ring, ringStyle(r1)]} />
              <Animated.View style={[styles.ring, ringStyle(r2)]} />
              <Animated.View style={[styles.ring, ringStyle(r3)]} />
              <Animated.View style={[styles.arcWrap, { transform: [{ rotate: arcRotate }] }]}>
                <View style={styles.arcInner} />
              </Animated.View>
              <Animated.View style={{ transform: [{ scale: centerPulse }] }}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.centerCircle}>
                  <Car size={28} color={Colors.textInverse} strokeWidth={2} />
                </LinearGradient>
              </Animated.View>
            </>
          ) : (
            <>
              <Animated.View
                style={[styles.foundRingOuter, { opacity: foundOpacity, transform: [{ scale: foundScale }] }]}
              />
              <Animated.View
                style={[styles.foundRingMid, { opacity: foundOpacity, transform: [{ scale: foundScale }] }]}
              />
              <Animated.View style={{ transform: [{ scale: foundScale }] }}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.centerCircle}>
                  <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                    <Check size={32} color={Colors.textInverse} strokeWidth={3} />
                  </Animated.View>
                </LinearGradient>
              </Animated.View>
            </>
          )}
        </View>

        {/* Text / driver info — lives OUTSIDE the bubble so rings stay centered on circle */}
        <View style={styles.infoBlock}>
          {phase === 'searching' ? (
            <>
              <Text style={styles.searchTitle}>Procurando motorista</Text>
              <Text style={styles.searchSub}>Aguarde, encontrando o melhor{'\n'}motorista perto de você</Text>
              <View style={styles.dotsRow}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={[styles.dot, { opacity: dotIdx === i ? 1 : 0.22 }]} />
                ))}
              </View>
            </>
          ) : (
            <>
              <Animated.Text style={[styles.foundTitle, { opacity: foundOpacity }]}>
                Motorista encontrado!
              </Animated.Text>
              <Animated.View
                style={[styles.driverCard, { opacity: driverOpacity, transform: [{ translateY: driverY }] }]}
              >
                <View style={styles.driverAvatar}>
                  <Car size={18} color={Colors.textInverse} />
                </View>
                <View>
                  <Text style={styles.driverName}>Motorista a caminho</Text>
                  <View style={styles.ratingRow}>
                    <Star size={11} color="#F59E0B" fill="#F59E0B" />
                    <Text style={styles.ratingTxt}>Conectando você ao motorista</Text>
                  </View>
                </View>
              </Animated.View>
            </>
          )}
        </View>
      </View>

      {/* Bottom sheet */}
      <View style={[styles.sheet, { height: SHEET_H }]}>
        <View style={styles.handle} />

        <View style={styles.routeRow}>
          <View style={styles.routeDots}>
            <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
            <View style={styles.routeConnLine} />
            <View style={[styles.routeDot, { backgroundColor: Colors.danger }]} />
          </View>
          <View style={styles.routeAddrs}>
            <View>
              <Text style={styles.routeLabel}>ORIGEM</Text>
              <Text style={styles.routeAddr}>Sua localização atual</Text>
            </View>
            <View style={{ marginTop: 8 }}>
              <Text style={styles.routeLabel}>DESTINO</Text>
              <Text style={styles.routeAddr} numberOfLines={1}>{destText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          {[{ val: priceText, lbl: 'Estimativa' }, { val: distText, lbl: 'Distância' }, { val: etaText, lbl: 'Duração' }].map(
            (s, i, arr) => (
              <React.Fragment key={s.lbl}>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{s.val}</Text>
                  <Text style={styles.statLbl}>{s.lbl}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.statDivider} />}
              </React.Fragment>
            ),
          )}
        </View>

        {phase === 'searching' ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <X size={15} color={Colors.danger} strokeWidth={2.5} />
            <Text style={styles.cancelTxt}>Cancelar corrida</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.etaRow}>
            <Clock size={13} color={Colors.primary} />
            <Text style={styles.etaTxt}>Motorista chegando em ~3 min</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C1A29' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.025)' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.025)' },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  animBubble: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center' },
  infoBlock: { alignItems: 'center', paddingHorizontal: 24, marginTop: -8 },

  ring: {
    position: 'absolute',
    width: RING_BASE,
    height: RING_BASE,
    borderRadius: RING_BASE / 2,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  arcWrap: {
    position: 'absolute',
    width: RING_BASE + 26,
    height: RING_BASE + 26,
    borderRadius: (RING_BASE + 26) / 2,
  },
  arcInner: {
    width: '100%',
    height: '100%',
    borderRadius: (RING_BASE + 26) / 2,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: Colors.primary,
    borderRightColor: Colors.primary + '50',
  },
  centerCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 20,
    elevation: 14,
  },

  searchTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#FFF', textAlign: 'center', marginBottom: 6 },
  searchSub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.52)', textAlign: 'center', lineHeight: 20 },
  dotsRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primary },

  foundRingOuter: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: Colors.primary + '14' },
  foundRingMid: { position: 'absolute', width: 124, height: 124, borderRadius: 62, backgroundColor: Colors.primary + '24' },
  foundTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFF', textAlign: 'center', marginBottom: 16 },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
  },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  driverAvatarTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textInverse },
  driverName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.6)' },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1, shadowRadius: 18, elevation: 18,
  },
  handle: { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  routeRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14, marginBottom: 12 },
  routeDots: { alignItems: 'center', paddingTop: 5, paddingBottom: 2 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeConnLine: { width: 2, flex: 1, backgroundColor: '#E5E5E5', marginVertical: 3 },
  routeAddrs: { flex: 1, justifyContent: 'space-between' },
  routeLabel: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted, letterSpacing: 0.9, marginBottom: 1 },
  routeAddr: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#000' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: '#F7F7F7', borderRadius: Radius.md, paddingVertical: 10, marginBottom: 12,
  },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#000' },
  statLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 1 },
  statDivider: { width: 1, height: 26, backgroundColor: '#E0E0E0' },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.danger + '40', backgroundColor: Colors.danger + '07',
  },
  cancelTxt: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.danger },

  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  etaTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary },
});

export default RideMatchingScreen;
