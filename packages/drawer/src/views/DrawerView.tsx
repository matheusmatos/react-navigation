import * as React from 'react';
import {
  View,
  StyleSheet,
  I18nManager,
  Platform,
  BackHandler,
} from 'react-native';
import { ScreenContainer } from 'react-native-screens';
import { useSafeAreaFrame } from 'react-native-safe-area-context';
import {
  NavigationHelpersContext,
  DrawerNavigationState,
  DrawerActions,
  useTheme,
  ParamListBase,
} from '@react-navigation/native';
import {
  Header,
  Screen,
  SafeAreaProviderCompat,
  getHeaderTitle,
} from '@react-navigation/elements';

import { GestureHandlerRootView } from './GestureHandler';
import ScreenFallback from './ScreenFallback';
import DrawerToggleButton from './DrawerToggleButton';
import DrawerContent from './DrawerContent';
import Drawer from './Drawer';
import DrawerStatusContext from '../utils/DrawerStatusContext';
import DrawerPositionContext from '../utils/DrawerPositionContext';
import getDrawerStatusFromState from '../utils/getDrawerStatusFromState';
import type {
  DrawerDescriptorMap,
  DrawerNavigationConfig,
  DrawerNavigationHelpers,
  DrawerContentComponentProps,
  DrawerHeaderProps,
  DrawerNavigationProp,
} from '../types';

type Props = DrawerNavigationConfig & {
  state: DrawerNavigationState<ParamListBase>;
  navigation: DrawerNavigationHelpers;
  descriptors: DrawerDescriptorMap;
};

const getDefaultDrawerWidth = ({
  height,
  width,
}: {
  height: number;
  width: number;
}) => {
  /*
   * Default drawer width is screen width - header height
   * with a max width of 280 on mobile and 320 on tablet
   * https://material.io/components/navigation-drawer
   */
  const smallerAxisSize = Math.min(height, width);
  const isLandscape = width > height;
  const isTablet = smallerAxisSize >= 600;
  const appBarHeight = Platform.OS === 'ios' ? (isLandscape ? 32 : 44) : 56;
  const maxWidth = isTablet ? 320 : 280;

  return Math.min(smallerAxisSize - appBarHeight, maxWidth);
};

const GestureHandlerWrapper = GestureHandlerRootView ?? View;

function DrawerViewBase({
  state,
  navigation,
  descriptors,
  drawerContent = (props: DrawerContentComponentProps) => (
    <DrawerContent {...props} />
  ),
  detachInactiveScreens = true,
}: Props) {
  const focusedRouteKey = state.routes[state.index].key;
  const {
    drawerHideStatusBarOnOpen = false,
    drawerPosition = I18nManager.isRTL ? 'right' : 'left',
    drawerStatusBarAnimation = 'slide',
    drawerStyle,
    drawerType = Platform.select({ ios: 'slide', default: 'front' }),
    gestureEnabled,
    gestureHandlerProps,
    keyboardDismissMode = 'on-drag',
    overlayColor = 'rgba(0, 0, 0, 0.5)',
    swipeEdgeWidth,
    swipeEnabled,
    swipeMinDistance,
  } = descriptors[focusedRouteKey].options;

  const [loaded, setLoaded] = React.useState([focusedRouteKey]);

  if (!loaded.includes(focusedRouteKey)) {
    setLoaded([...loaded, focusedRouteKey]);
  }

  const dimensions = useSafeAreaFrame();

  const { colors } = useTheme();

  const drawerStatus = getDrawerStatusFromState(state);

  const handleDrawerOpen = React.useCallback(() => {
    navigation.dispatch({
      ...DrawerActions.openDrawer(),
      target: state.key,
    });
  }, [navigation, state.key]);

  const handleDrawerClose = React.useCallback(() => {
    navigation.dispatch({
      ...DrawerActions.closeDrawer(),
      target: state.key,
    });
  }, [navigation, state.key]);

  React.useEffect(() => {
    if (drawerStatus !== 'open' || drawerType === 'permanent') {
      return;
    }

    const handleClose = () => {
      // We shouldn't handle the back button if the parent screen isn't focused
      // This will avoid the drawer overriding event listeners from a focused screen
      if (!navigation.isFocused()) {
        return false;
      }

      handleDrawerClose();

      return true;
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // We only add the listeners when drawer opens
    // This way we can make sure that the listener is added as late as possible
    // This will make sure that our handler will run first when back button is pressed
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleClose
    );

    if (Platform.OS === 'web') {
      document?.body?.addEventListener?.('keyup', handleEscape);
    }

    return () => {
      subscription.remove();

      if (Platform.OS === 'web') {
        document?.body?.removeEventListener?.('keyup', handleEscape);
      }
    };
  }, [drawerStatus, drawerType, handleDrawerClose, navigation]);

  const renderDrawerContent = ({ progress }: any) => {
    return (
      <DrawerPositionContext.Provider value={drawerPosition}>
        {drawerContent({
          progress: progress,
          state: state,
          navigation: navigation,
          descriptors: descriptors,
        })}
      </DrawerPositionContext.Provider>
    );
  };

  const renderSceneContent = () => {
    return (
      // @ts-ignore
      <ScreenContainer enabled={detachInactiveScreens} style={styles.content}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const { lazy = true, unmountOnBlur } = descriptor.options;
          const isFocused = state.index === index;

          if (unmountOnBlur && !isFocused) {
            return null;
          }

          if (lazy && !loaded.includes(route.key) && !isFocused) {
            // Don't render a lazy screen if we've never navigated to it
            return null;
          }

          const {
            header = ({ layout, options }: DrawerHeaderProps) => (
              <Header
                {...options}
                layout={layout}
                title={getHeaderTitle(options, route.name)}
                headerLeft={
                  options.headerLeft ??
                  ((props) => <DrawerToggleButton {...props} />)
                }
              />
            ),
            sceneContainerStyle,
          } = descriptor.options;

          return (
            <ScreenFallback
              key={route.key}
              style={[StyleSheet.absoluteFill, { opacity: isFocused ? 1 : 0 }]}
              visible={isFocused}
              enabled={detachInactiveScreens}
            >
              <Screen
                focused={isFocused}
                route={descriptor.route}
                navigation={descriptor.navigation}
                headerShown={descriptor.options.headerShown}
                headerStatusBarHeight={descriptor.options.headerStatusBarHeight}
                header={header({
                  layout: dimensions,
                  route: descriptor.route,
                  navigation: descriptor.navigation as DrawerNavigationProp<ParamListBase>,
                  options: descriptor.options,
                })}
                style={sceneContainerStyle}
              >
                {descriptor.render()}
              </Screen>
            </ScreenFallback>
          );
        })}
      </ScreenContainer>
    );
  };

  return (
    <DrawerStatusContext.Provider value={drawerStatus}>
      <Drawer
        open={drawerStatus !== 'closed'}
        gestureEnabled={gestureEnabled}
        swipeEnabled={swipeEnabled}
        onOpen={handleDrawerOpen}
        onClose={handleDrawerClose}
        gestureHandlerProps={gestureHandlerProps}
        drawerType={drawerType}
        drawerPosition={drawerPosition}
        drawerStyle={[
          {
            width: getDefaultDrawerWidth(dimensions),
            backgroundColor: colors.card,
          },
          drawerType === 'permanent' &&
            (drawerPosition === 'left'
              ? {
                  borderRightColor: colors.border,
                  borderRightWidth: StyleSheet.hairlineWidth,
                }
              : {
                  borderLeftColor: colors.border,
                  borderLeftWidth: StyleSheet.hairlineWidth,
                }),
          drawerStyle,
        ]}
        overlayStyle={{ backgroundColor: overlayColor }}
        swipeEdgeWidth={swipeEdgeWidth}
        swipeDistanceThreshold={swipeMinDistance}
        hideStatusBarOnOpen={drawerHideStatusBarOnOpen}
        statusBarAnimation={drawerStatusBarAnimation}
        renderDrawerContent={renderDrawerContent}
        renderSceneContent={renderSceneContent}
        keyboardDismissMode={keyboardDismissMode}
        dimensions={dimensions}
      />
    </DrawerStatusContext.Provider>
  );
}

export default function DrawerView({ navigation, ...rest }: Props) {
  return (
    <NavigationHelpersContext.Provider value={navigation}>
      <SafeAreaProviderCompat>
        <GestureHandlerWrapper style={styles.content}>
          <DrawerViewBase navigation={navigation} {...rest} />
        </GestureHandlerWrapper>
      </SafeAreaProviderCompat>
    </NavigationHelpersContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
