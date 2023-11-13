import { useEffect, useRef } from 'react';
import { Animated, PanResponder, useWindowDimensions } from 'react-native';

type Position = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 4;
function getAnimatedValue(val: Animated.Value): number {
  // @ts-ignore
  return val._value;
}
function getRangedScale(scale: number) {
  return Math.min(Math.max(MIN_SCALE, scale), MAX_SCALE);
}
function getDistanceFrom(p1: Position, p2: Position) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt((dx + dy) ** 2);
}
function getCenter(a: number, b: number) {
  return (a + b) / 2;
}
function getCenterOf(p1: Position, p2: Position) {
  return {
    x: getCenter(p1.x, p2.x),
    y: getCenter(p1.y, p2.y),
  };
}
function getInitialPosition(): [Position, Position] {
  return [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
}

const usePinchZoom = (params: {
  zoomScale: Animated.Value;
  translatePosition: Animated.ValueXY;
  left: number;
  top: number;
}) => {
  const { zoomScale, translatePosition, left, top } = params;

  const initialZoomScale = useRef(getAnimatedValue(zoomScale));
  const pinchProgress = useRef(false);
  const pinchStartRef = useRef<[Position, Position]>(getInitialPosition());
  const pinchEndRef = useRef<[Position, Position]>(getInitialPosition());

  const onPinchProgress = (p1: Position, p2: Position) => {
    if (!pinchProgress.current) {
      pinchProgress.current = true;
      pinchStartRef.current = [p1, p2];
    } else {
      const [sp1, sp2] = pinchStartRef.current;

      const initialDist = getDistanceFrom(sp1, sp2);
      const currentDist = getDistanceFrom(p1, p2);
      const zoom = currentDist / initialDist;

      const initialCenter = getCenterOf(sp1, sp2);
      const currentCenter = getCenterOf(p1, p2);
      const dx = currentCenter.x - initialCenter.x;
      const dy = currentCenter.y - initialCenter.y;

      console.log('initialPosition', left, top);
      const nextLeft = (left + dx - currentCenter.x) * zoom + currentCenter.x;
      const nextTop = (top + dy - currentCenter.y) * zoom + currentCenter.y;
      console.log('nextPosition', nextLeft, nextTop);

      const nextZoomScale = getRangedScale(initialZoomScale.current * zoom);
      zoomScale.setValue(nextZoomScale);
      // translatePosition.x.setValue(nextLeft);

      // translatePosition.y.setValue(nextTop);
    }
  };
  const onPinchFinished = () => {
    pinchProgress.current = false;
    pinchStartRef.current = getInitialPosition();
    pinchEndRef.current = getInitialPosition();
    initialZoomScale.current = getAnimatedValue(zoomScale);
  };

  return {
    onPinchProgress,
    onPinchFinished,
  };
};

export function useZoom() {
  const window = useWindowDimensions();

  const zoomScale = useRef(new Animated.Value(1)).current;
  const translatePosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const initialTranslatePosition = useRef({ x: 0, y: 0 });

  const { onPinchProgress, onPinchFinished } = usePinchZoom({
    zoomScale,
    translatePosition,
    left: initialTranslatePosition.current.x,
    top: initialTranslatePosition.current.y,
  });

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (e, gestureState) => {
      if (e.nativeEvent.touches.length > 1) {
        const [t1, t2] = e.nativeEvent.touches;
        onPinchProgress({ x: t1.pageX, y: t1.pageY }, { x: t2.pageX, y: t2.pageY });
      } else {
        return Animated.event([null, { dx: translatePosition.x, dy: translatePosition.y }], { useNativeDriver: false })(
          e,
          gestureState,
        );
      }
    },
    onPanResponderRelease: (e) => {
      if (e.nativeEvent.changedTouches.length > 1) {
        onPinchFinished();
      }

      initialTranslatePosition.current.x = getAnimatedValue(translatePosition.x);
      initialTranslatePosition.current.y = getAnimatedValue(translatePosition.y);
      translatePosition.extractOffset();
    },
  });

  const inputRange = [-window.width, window.width];
  const outputRange = inputRange.map((it) => {
    return it * getAnimatedValue(zoomScale) - it;
  });

  return {
    panResponder,
    style: {
      transform: [
        {
          translateX: translatePosition.x.interpolate({
            extrapolate: 'clamp',
            inputRange,
            outputRange,
          }),
        },
        {
          translateY: translatePosition.y.interpolate({
            extrapolate: 'clamp',
            inputRange: [-window.height, window.height],
            outputRange: [-window.height, window.height],
          }),
        },
        { scale: zoomScale },
      ],
    },
  };
}
