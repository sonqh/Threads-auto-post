## React-use Hook Features

- **Sensors**

  - `useBattery`: tracks device battery state
  - `useGeolocation`: tracks geo location state of user's device
  - `useHover`, `useHoverDirty`: tracks mouse hover state of an element
  - `useHash`: tracks location hash value
  - `useIdle`: tracks whether user is inactive
  - `useIntersection`: tracks an HTML element's intersection
  - `useKey`, `useKeyPress`, `useKeyboardJs`, `useKeyPressEvent`: track key presses
  - `useLocation`, `useSearchParam`: tracks page navigation bar location state
  - `useLongPress`: tracks long press gesture
  - `useMedia`: tracks state of a CSS media query
  - `useMediaDevices`: tracks state of connected hardware devices
  - `useMotion`: tracks device's motion sensor
  - `useMouse`, `useMouseHovered`: tracks mouse position
  - `useMouseWheel`: tracks mouse wheel scroll delta
  - `useNetworkState`: tracks browser network connection state
  - `useOrientation`: tracks device screen orientation
  - `usePageLeave`: triggers when mouse leaves page boundaries
  - `useScratch`: tracks mouse click-and-scrub state
  - `useScroll`: tracks scroll position of an element
  - `useScrolling`: tracks whether an element is scrolling
  - `useStartTyping`: detects when user starts typing
  - `useWindowScroll`: tracks window scroll position
  - `useWindowSize`: tracks window dimensions
  - `useMeasure`, `useSize`: tracks element dimensions
  - `createBreakpoint`: tracks innerWidth
  - `useScrollbarWidth`: detects browser scrollbar width
  - `usePinchZoom`: detects pinch zoom status

- **UI**

  - `useAudio`: plays audio and exposes controls
  - `useClickAway`: triggers callback when user clicks outside target area
  - `useCss`: dynamically adjusts CSS
  - `useDrop`, `useDropArea`: tracks file, link, and copy-paste drops
  - `useFullscreen`: display element or video full-screen
  - `useSlider`: provides slide behavior over any element
  - `useSpeech`: synthesizes speech from text
  - `useVibrate`: provides physical feedback using Vibration API
  - `useVideo`: plays video, tracks state, exposes playback controls

- **Animations**

  - `useRaf`: re-renders component on each requestAnimationFrame
  - `useInterval`, `useHarmonicIntervalFn`: re-render on set interval
  - `useSpring`: interpolates number over time
  - `useTimeout`: re-renders after a timeout
  - `useTimeoutFn`: calls function after a timeout
  - `useTween`: tween a number from 0 to 1
  - `useUpdate`: returns callback to re-render component

- **Side-effects**

  - `useAsync`, `useAsyncFn`, `useAsyncRetry`: resolves async functions
  - `useBeforeUnload`: shows alert when user reloads/closes page
  - `useCookie`: read, update, delete cookies
  - `useCopyToClipboard`: copies text to clipboard
  - `useDebounce`: debounces a function
  - `useError`: error dispatcher
  - `useFavicon`: sets page favicon
  - `useLocalStorage`: manages value in localStorage
  - `useLockBodyScroll`: locks body scroll
  - `useRafLoop`: calls function inside RAF loop
  - `useSessionStorage`: manages value in sessionStorage
  - `useThrottle`, `useThrottleFn`: throttles a function
  - `useTitle`: sets page title
  - `usePermission`: query permission status for browser APIs

- **Lifecycles**

  - `useEffectOnce`: runs effect only once
  - `useEvent`: subscribe to events
  - `useLifecycles`: calls mount/unmount callbacks
  - `useMountedState`, `useUnmountPromise`: track if component is mounted
  - `usePromise`: resolves promise only while mounted
  - `useLogger`: logs lifecycle events
  - `useMount`: calls mount callbacks
  - `useUnmount`: calls unmount callbacks
  - `useUpdateEffect`: runs effect only on updates
  - `useIsomorphicLayoutEffect`: useLayoutEffect for server
  - `useDeepCompareEffect`, `useShallowCompareEffect`, `useCustomCompareEffect`: advanced effect hooks

- **State**

  - `createMemo`: memoized hooks
  - `createReducer`: reducer hooks with custom middleware
  - `createReducerContext`, `createStateContext`: shared state between components
  - `useDefault`: returns default value when state is null/undefined
  - `useGetSet`: returns state getter
  - `useGetSetState`: hybrid get/set state
  - `useLatest`: returns latest state/props
  - `usePrevious`: returns previous state/props
  - `usePreviousDistinct`: previous state with predicate
  - `useObservable`: tracks latest value of Observable
  - `useRafState`: setState after requestAnimationFrame
  - `useSetState`: setState like class component
  - `useStateList`: circularly iterate over array
  - `useToggle`, `useBoolean`: boolean state
  - `useCounter`, `useNumber`: number state
  - `useList`: array state
  - `useMap`: object state
  - `useSet`: Set state
  - `useQueue`: simple queue
  - `useStateValidator`: state validation
  - `useStateWithHistory`: state history and navigation
  - `useMultiStateValidator`: validate multiple states
  - `useMediatedState`: state with mediation function
  - `useFirstMountState`: check if first render
  - `useRendersCount`: count renders
  - `createGlobalState`: shared global state
  - `useMethods`: alternative to useReducer

- **Miscellaneous**
  - `useEnsuredForwardedRef`, `ensuredForwardRef`: safe React.forwardedRef
