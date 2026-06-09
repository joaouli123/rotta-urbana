import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Shadows, Typography } from '../../constants';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  padding?: number;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  elevated = false,
  padding = 16,
}) => (
  <View
    style={[
      styles.card,
      elevated && styles.elevated,
      { padding },
      style,
    ]}
  >
    {children}
  </View>
);

interface BadgeProps {
  label: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'primary', size = 'sm' }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: Colors.primary + '22', text: Colors.primary },
    success: { bg: Colors.success + '22', text: Colors.success },
    warning: { bg: Colors.warning + '22', text: Colors.warning },
    danger: { bg: Colors.danger + '22', text: Colors.danger },
    info: { bg: Colors.info + '22', text: Colors.info },
    muted: { bg: Colors.card, text: Colors.textSecondary },
  };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors[variant].bg },
        size === 'md' && styles.badgeMd,
      ]}
    >
      <Text style={[styles.badgeText, { color: colors[variant].text }, size === 'md' && styles.badgeTextMd]}>
        {label}
      </Text>
    </View>
  );
};

interface DividerProps {
  style?: ViewStyle;
  label?: string;
}

export const Divider: React.FC<DividerProps> = ({ style, label }) => (
  <View style={[styles.dividerRow, style]}>
    <View style={styles.dividerLine} />
    {label && <Text style={styles.dividerLabel}>{label}</Text>}
    {label && <View style={styles.dividerLine} />}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevated: {
    ...Shadows.medium,
    backgroundColor: Colors.cardElevated,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    ...Typography.captionMedium,
    fontWeight: '600',
  },
  badgeTextMd: {
    ...Typography.smallMedium,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
});
