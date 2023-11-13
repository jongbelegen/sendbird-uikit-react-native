import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useZoom } from './useZoom';

export const ImageViewer = ({ uri, onLoadEnd }: { uri: string; onLoadEnd: () => void }) => {
  const { style, panResponder } = useZoom();
  return (
    <View {...panResponder.panHandlers} style={StyleSheet.absoluteFill}>
      <Animated.Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, style]}
        resizeMode={'contain'}
        onLoadEnd={onLoadEnd}
      />
    </View>
  );
};
