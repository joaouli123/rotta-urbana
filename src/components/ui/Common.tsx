import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Star, ChevronRight } from 'lucide-react-native';
import { Colors, Radius, Typography } from '../../constants';

interface AvatarProps {
  name: string;
  size?: number;
  imageUrl?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 44, imageUrl }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
};

interface RatingProps {
  value: number;
  size?: number;
  showValue?: boolean;
}

export const Rating: React.FC<RatingProps> = ({ value, size = 14, showValue = true }) => (
  <View style={styles.ratingRow}>
    <Star size={size} color={Colors.warning} fill={Colors.warning} />
    {showValue && (
      <Text style={[styles.ratingText, { fontSize: size }]}>{value.toFixed(1)}</Text>
    )}
  </View>
);

interface ListItemProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showArrow?: boolean;
}

export const ListItem: React.FC<ListItemProps> = ({
  icon,
  title,
  subtitle,
  right,
  onPress,
  showArrow = true,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={styles.listItem}
    disabled={!onPress}
    activeOpacity={0.7}
  >
    {icon && <View style={styles.listIcon}>{icon}</View>}
    <View style={styles.listContent}>
      <Text style={styles.listTitle}>{title}</Text>
      {subtitle && <Text style={styles.listSubtitle}>{subtitle}</Text>}
    </View>
    {right}
    {!right && showArrow && onPress && (
      <ChevronRight size={18} color={Colors.textMuted} />
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    resizeMode: 'cover',
  },
  initials: {
    color: Colors.white,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flex: 1,
  },
  listTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  listSubtitle: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
