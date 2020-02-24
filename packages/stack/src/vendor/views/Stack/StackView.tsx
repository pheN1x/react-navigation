import * as React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { SafeAreaConsumer, EdgeInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  StackActions,
  NavigationState as StackNavigationState,
  SceneView,
} from 'react-navigation';

import CardStack from './CardStack';
import KeyboardManager from '../KeyboardManager';
import HeaderContainer, {
  Props as HeaderContainerProps,
} from '../Header/HeaderContainer';
import SafeAreaProviderCompat from '../SafeAreaProviderCompat';
import {
  Route,
  StackNavigationHelpers,
  StackNavigationConfig,
  StackDescriptorMap,
} from '../../types';

type Props = StackNavigationConfig & {
  state: StackNavigationState;
  navigation: StackNavigationHelpers;
  descriptors: StackDescriptorMap;
  screenProps: unknown;
};

type State = {
  // Local copy of the routes which are actually rendered
  routes: Route<string>[];
  // Previous routes, to compare whether routes have changed or not
  previousRoutes: Route<string>[];
  // Previous descriptors, to compare whether descriptors have changed or not
  previousDescriptors: StackDescriptorMap;
  // List of routes being opened, we need to animate pushing of these new routes
  openingRouteKeys: string[];
  // List of routes being closed, we need to animate popping of these routes
  closingRouteKeys: string[];
  // List of routes being replaced, we need to keep a copy until the new route animates in
  replacingRouteKeys: string[];
  // Since the local routes can vary from the routes from props, we need to keep the descriptors for old routes
  // Otherwise we won't be able to access the options for routes that were removed
  descriptors: StackDescriptorMap;
};

const GestureHandlerWrapper = GestureHandlerRootView ?? View;

export default class StackView extends React.Component<Props, State> {
  static getDerivedStateFromProps(
    props: Readonly<Props>,
    state: Readonly<State>
  ) {
    // If there was no change in routes, we don't need to compute anything
    if (props.state.routes === state.previousRoutes && state.routes.length) {
      if (props.descriptors !== state.previousDescriptors) {
        const descriptors = state.routes.reduce<StackDescriptorMap>(
          (acc, route) => {
            acc[route.key] =
              props.descriptors[route.key] || state.descriptors[route.key];

            return acc;
          },
          {}
        );

        return {
          previousDescriptors: props.descriptors,
          descriptors,
        };
      }

      return null;
    }

    // Here we determine which routes were added or removed to animate them
    // We keep a copy of the route being removed in local state to be able to animate it

    let routes =
      props.state.index < props.state.routes.length - 1
        ? // Remove any extra routes from the state
          // The last visible route should be the focused route, i.e. at current index
          props.state.routes.slice(0, props.state.index + 1)
        : props.state.routes;

    // Now we need to determine which routes were added and removed
    let {
      openingRouteKeys,
      closingRouteKeys,
      replacingRouteKeys,
      previousRoutes,
    } = state;

    const previousFocusedRoute = previousRoutes[previousRoutes.length - 1] as
      | Route<string>
      | undefined;
    const nextFocusedRoute = routes[routes.length - 1];

    const isAnimationEnabled = (key: string) => {
      const descriptor = props.descriptors[key] || state.descriptors[key];

      return descriptor ? descriptor.options.animationEnabled !== false : true;
    };

    const getAnimationTypeForReplace = (key: string) => {
      const descriptor = props.descriptors[key] || state.descriptors[key];

      return descriptor.options.animationTypeForReplace ?? 'push';
    };

    if (
      previousFocusedRoute &&
      previousFocusedRoute.key !== nextFocusedRoute.key
    ) {
      // We only need to animate routes if the focused route changed
      // Animating previous routes won't be visible coz the focused route is on top of everything

      if (!previousRoutes.find(r => r.key === nextFocusedRoute.key)) {
        // A new route has come to the focus, we treat this as a push
        // A replace can also trigger this, the animation should look like push

        if (
          isAnimationEnabled(nextFocusedRoute.key) &&
          !openingRouteKeys.includes(nextFocusedRoute.key)
        ) {
          // In this case, we need to animate pushing the focused route
          // We don't care about animating any other added routes because they won't be visible
          openingRouteKeys = [...openingRouteKeys, nextFocusedRoute.key];

          closingRouteKeys = closingRouteKeys.filter(
            key => key !== nextFocusedRoute.key
          );
          replacingRouteKeys = replacingRouteKeys.filter(
            key => key !== nextFocusedRoute.key
          );

          if (!routes.find(r => r.key === previousFocusedRoute.key)) {
            // The previous focused route isn't present in state, we treat this as a replace

            openingRouteKeys = openingRouteKeys.filter(
              key => key !== previousFocusedRoute.key
            );

            if (getAnimationTypeForReplace(nextFocusedRoute.key) === 'pop') {
              closingRouteKeys = [
                ...closingRouteKeys,
                previousFocusedRoute.key,
              ];

              // By default, new routes have a push animation, so we add it to `openingRouteKeys` before
              // But since user configured it to animate the old screen like a pop, we need to add this without animation
              // So remove it from `openingRouteKeys` which will remove the animation
              openingRouteKeys = openingRouteKeys.filter(
                key => key !== nextFocusedRoute.key
              );

              // Keep the route being removed at the end to animate it out
              routes = [...routes, previousFocusedRoute];
            } else {
              replacingRouteKeys = [
                ...replacingRouteKeys,
                previousFocusedRoute.key,
              ];

              closingRouteKeys = closingRouteKeys.filter(
                key => key !== previousFocusedRoute.key
              );

              // Keep the old route in the state because it's visible under the new route, and removing it will feel abrupt
              // We need to insert it just before the focused one (the route being pushed)
              // After the push animation is completed, routes being replaced will be removed completely
              routes = routes.slice();
              routes.splice(routes.length - 1, 0, previousFocusedRoute);
            }
          }
        }
      } else if (!routes.find(r => r.key === previousFocusedRoute.key)) {
        // The previously focused route was removed, we treat this as a pop

        if (
          isAnimationEnabled(previousFocusedRoute.key) &&
          !closingRouteKeys.includes(previousFocusedRoute.key)
        ) {
          closingRouteKeys = [...closingRouteKeys, previousFocusedRoute.key];

          // Sometimes a route can be closed before the opening animation finishes
          // So we also need to remove it from the opening list
          openingRouteKeys = openingRouteKeys.filter(
            key => key !== previousFocusedRoute.key
          );
          replacingRouteKeys = replacingRouteKeys.filter(
            key => key !== previousFocusedRoute.key
          );

          // Keep a copy of route being removed in the state to be able to animate it
          routes = [...routes, previousFocusedRoute];
        }
      } else {
        // Looks like some routes were re-arranged and no focused routes were added/removed
        // i.e. the currently focused route already existed and the previously focused route still exists
        // We don't know how to animate this
      }
    } else if (replacingRouteKeys.length || closingRouteKeys.length) {
      // Keep the routes we are closing or replacing if animation is enabled for them
      routes = routes.slice();
      routes.splice(
        routes.length - 1,
        0,
        ...state.routes.filter(({ key }) =>
          isAnimationEnabled(key)
            ? replacingRouteKeys.includes(key) || closingRouteKeys.includes(key)
            : false
        )
      );
    }

    if (!routes.length) {
      throw new Error(
        'There should always be at least one route in the navigation state.'
      );
    }

    const descriptors = routes.reduce<StackDescriptorMap>((acc, route) => {
      acc[route.key] =
        props.descriptors[route.key] || state.descriptors[route.key];

      return acc;
    }, {});

    return {
      routes,
      previousRoutes: props.state.routes,
      previousDescriptors: props.descriptors,
      openingRouteKeys,
      closingRouteKeys,
      replacingRouteKeys,
      descriptors,
    };
  }

  state: State = {
    routes: [],
    previousRoutes: [],
    previousDescriptors: {},
    openingRouteKeys: [],
    closingRouteKeys: [],
    replacingRouteKeys: [],
    descriptors: {},
  };

  private getGesturesEnabled = ({ route }: { route: Route<string> }) => {
    const descriptor = this.state.descriptors[route.key];

    if (descriptor) {
      const { gestureEnabled, animationEnabled } = descriptor.options;

      if (animationEnabled === false) {
        // When animation is disabled, also disable gestures
        // The gesture to dismiss a route will look weird when not animated
        return false;
      }

      return gestureEnabled !== undefined
        ? gestureEnabled
        : Platform.OS !== 'android';
    }

    return false;
  };

  private getPreviousRoute = ({ route }: { route: Route<string> }) => {
    const { closingRouteKeys, replacingRouteKeys } = this.state;
    const routes = this.state.routes.filter(
      r =>
        r.key === route.key ||
        (!closingRouteKeys.includes(r.key) &&
          !replacingRouteKeys.includes(r.key))
    );

    const index = routes.findIndex(r => r.key === route.key);

    return routes[index - 1];
  };

  private renderScene = ({ route }: { route: Route<string> }) => {
    const descriptor =
      this.state.descriptors[route.key] || this.props.descriptors[route.key];

    if (!descriptor) {
      return null;
    }

    const { navigation, getComponent } = descriptor;
    const SceneComponent = getComponent();

    return (
      <SceneView
        screenProps={this.props.screenProps}
        navigation={navigation}
        component={SceneComponent}
      />
    );
  };

  private renderHeader = (props: HeaderContainerProps) => {
    return <HeaderContainer {...props} />;
  };

  private handleTransitionComplete = ({ route }: { route: Route<string> }) => {
    // TODO: remove when the new event system lands
    this.props.navigation.dispatch(
      StackActions.completeTransition({ toChildKey: route.key })
    );
  };

  private handleOpenRoute = ({ route }: { route: Route<string> }) => {
    this.handleTransitionComplete({ route });
    this.setState(state => ({
      routes: state.replacingRouteKeys.length
        ? state.routes.filter(r => !state.replacingRouteKeys.includes(r.key))
        : state.routes,
      openingRouteKeys: state.openingRouteKeys.filter(key => key !== route.key),
      closingRouteKeys: state.closingRouteKeys.filter(key => key !== route.key),
      replacingRouteKeys: [],
    }));
  };

  private handleCloseRoute = ({ route }: { route: Route<string> }) => {
    const { state, navigation } = this.props;

    if (state.routes.find(r => r.key === route.key)) {
      // If a route exists in state, trigger a pop
      // This will happen in when the route was closed from the card component
      // e.g. When the close animation triggered from a gesture ends
      // @ts-ignore
      navigation.dispatch(StackActions.pop({ key: route.key }));
    } else {
      // While closing route we need to point to the previous one assuming that
      // this previous one in routes array
      const index = this.state.routes.findIndex(r => r.key === route.key);

      this.handleTransitionComplete({
        route: this.state.routes[Math.max(index - 1, 0)],
      });

      // We need to clean up any state tracking the route and pop it immediately
      this.setState(state => ({
        routes: state.routes.filter(r => r.key !== route.key),
        openingRouteKeys: state.openingRouteKeys.filter(
          key => key !== route.key
        ),
        closingRouteKeys: state.closingRouteKeys.filter(
          key => key !== route.key
        ),
      }));
    }
  };

  private handleTransitionStart = (
    { route }: { route: Route<string> },
    closing: boolean
  ) => {
    const { descriptors } = this.props;
    const descriptor =
      descriptors[route.key] || this.state.descriptors[route.key];

    descriptor?.options.onTransitionStart?.({ closing });
  };

  private handleTransitionEnd = (
    { route }: { route: Route<string> },
    closing: boolean
  ) => {
    const { descriptors } = this.props;
    const descriptor =
      descriptors[route.key] || this.state.descriptors[route.key];

    descriptor?.options.onTransitionEnd?.({ closing });
  };

  render() {
    const {
      state,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      navigation,
      keyboardHandlingEnabled,
      mode = 'card',
      ...rest
    } = this.props;

    const {
      routes,
      descriptors,
      openingRouteKeys,
      closingRouteKeys,
    } = this.state;

    const headerMode =
      mode !== 'modal' && Platform.OS === 'ios' ? 'float' : 'screen';

    return (
      <GestureHandlerWrapper style={styles.container}>
        <SafeAreaProviderCompat>
          <SafeAreaConsumer>
            {insets => (
              <KeyboardManager enabled={keyboardHandlingEnabled !== false}>
                {props => (
                  <CardStack
                    mode={mode}
                    insets={insets as EdgeInsets}
                    getPreviousRoute={this.getPreviousRoute}
                    getGesturesEnabled={this.getGesturesEnabled}
                    routes={routes}
                    openingRouteKeys={openingRouteKeys}
                    closingRouteKeys={closingRouteKeys}
                    onOpenRoute={this.handleOpenRoute}
                    onCloseRoute={this.handleCloseRoute}
                    onTransitionStart={this.handleTransitionStart}
                    onTransitionEnd={this.handleTransitionEnd}
                    renderHeader={this.renderHeader}
                    renderScene={this.renderScene}
                    headerMode={headerMode}
                    state={state}
                    descriptors={descriptors}
                    {...rest}
                    {...props}
                  />
                )}
              </KeyboardManager>
            )}
          </SafeAreaConsumer>
        </SafeAreaProviderCompat>
      </GestureHandlerWrapper>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});