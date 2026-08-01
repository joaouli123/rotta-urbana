import React from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Image,
  KeyboardTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const AUTH_DARK = '#131313';
export const AUTH_GREEN = '#76C442';
export const AUTH_MUTED = '#888888';

interface AuthHeaderProps {
  title: string;
  onBack: () => void;
}

export function AuthHeader({ title, onBack }: AuthHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <ImageBackground
      source={require('../../../assets/auth-city-curve-v3.png')}
      resizeMode="cover"
      imageStyle={styles.heroImage}
      style={[styles.header, { height: width * 0.52 }]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        activeOpacity={0.8}
        onPress={onBack}
        style={[styles.backButton, { position: 'absolute', left: 16, top: insets.top + 8, zIndex: 10 }]}
      >
        <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>
      
      <Image
        source={require('../../../assets/logo.png')}
        style={[styles.logo, { top: insets.top + 8, width: width * 0.5 }]}
        resizeMode="contain"
      />
    </ImageBackground>
  );
}

interface AuthFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  maxLength?: number;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'none',
  secureTextEntry,
  maxLength,
  leftIcon,
  rightElement,
}: AuthFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        {leftIcon ? <View style={styles.fieldIcon}>{leftIcon}</View> : null}
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          maxLength={maxLength}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#B0B0B0"
          secureTextEntry={secureTextEntry}
          style={styles.fieldInput}
          value={value}
        />
        {rightElement ? <View style={styles.fieldRight}>{rightElement}</View> : null}
      </View>
      <View style={styles.fieldLine} />
    </View>
  );
}

interface AuthPrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AuthPrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
}: AuthPrimaryButtonProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.primaryButton, (disabled || loading) && styles.disabled, style]}
    >
      {loading
        ? <ActivityIndicator color="#FFFFFF" size="small" />
        : <Text style={styles.primaryButtonText}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    alignItems: 'center',
  },
  logo: {
    position: 'absolute',
    height: 80,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
  },
  headerSpacer: { width: 40 },
  fieldWrap: { marginBottom: 20 },
  fieldLabel: {
    color: AUTH_MUTED,
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldIcon: {
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    color: '#1A1A1A',
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    paddingVertical: 8,
  },
  fieldRight: { paddingLeft: 8 },
  fieldLine: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginTop: 2,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
  },
  disabled: { opacity: 0.7 },
});
