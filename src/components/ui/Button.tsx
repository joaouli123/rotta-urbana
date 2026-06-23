import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Shadows, Typography } from '../../constants';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  style,
  textStyle,
  fullWidth = true,
}) => {
  const sizeStyles = {
    sm: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.md },
    md: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: Radius.md },
    lg: { paddingVertical: 18, paddingHorizontal: 24, borderRadius: Radius.lg },
  };

  const textSizes: Record<string, object> = {
    sm: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    md: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
    lg: { fontSize: 17, fontFamily: 'Poppins_700Bold' },
  };

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          styles.button,
          sizeStyles[size],
          Shadows.primary,
          { backgroundColor: disabled ? '#CCCCCC' : Colors.primary },
          fullWidth && { width: '100%' },
          style,
        ]}
        activeOpacity={0.85}
      >
        {icon && <>{icon}</>}
        {loading ? (
          <ActivityIndicator color={Colors.textInverse} size="small" />
        ) : (
          <Text style={[styles.textPrimary, textSizes[size], textStyle]}>{title}</Text>
        )}
        {iconRight && <>{iconRight}</>}
      </TouchableOpacity>
    );
  }

  const variantStyles: Record<string, ViewStyle> = {
    secondary: { backgroundColor: Colors.card },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: Colors.danger },
  };

  const variantTextColor: Record<string, string> = {
    secondary: Colors.textPrimary,
    outline: Colors.primary,
    ghost: Colors.primary,
    danger: Colors.white,
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        sizeStyles[size],
        variantStyles[variant],
        disabled && styles.disabled,
        fullWidth && { width: '100%' },
        style,
      ]}
      activeOpacity={0.75}
    >
      {icon && <>{icon}</>}
      {loading ? (
        <ActivityIndicator color={variantTextColor[variant]} size="small" />
      ) : (
        <Text style={[styles.text, textSizes[size], { color: variantTextColor[variant] }, textStyle]}>
          {title}
        </Text>
      )}
      {iconRight && <>{iconRight}</>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  textPrimary: {
    color: Colors.textInverse,
    ...Typography.bodySemiBold,
  },
  text: {
    ...Typography.bodySemiBold,
  },
  disabled: {
    opacity: 0.5,
  },
});
