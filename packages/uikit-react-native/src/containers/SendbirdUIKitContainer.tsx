import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Sendbird from '@sendbird/chat';
import { GroupChannelModule } from '@sendbird/chat/groupChannel';
import { OpenChannelModule } from '@sendbird/chat/openChannel';
import type { HeaderStyleContextType, UIKitTheme } from '@sendbird/uikit-react-native-foundation';
import {
  DialogProvider,
  Header,
  HeaderStyleProvider,
  LightUIKitTheme,
  ToastProvider,
  UIKitThemeProvider,
} from '@sendbird/uikit-react-native-foundation';
import type {
  SendbirdChatSDK,
  SendbirdGroupChannel,
  SendbirdGroupChannelCreateParams,
  SendbirdMember,
  SendbirdUser,
} from '@sendbird/uikit-utils';
import { NOOP, useIsFirstMount } from '@sendbird/uikit-utils';

import { LocalizationContext, LocalizationProvider } from '../contexts/LocalizationCtx';
import { PlatformServiceProvider } from '../contexts/PlatformServiceCtx';
import { ReactionProvider } from '../contexts/ReactionCtx';
import type { UIKitFeaturesInSendbirdChatContext } from '../contexts/SendbirdChatCtx';
import { SendbirdChatProvider } from '../contexts/SendbirdChatCtx';
import { UserProfileProvider } from '../contexts/UserProfileCtx';
import { useEmojiManager } from '../hooks/libs/useEmojiManager';
import { useImageCompressionConfig } from '../hooks/libs/useImageCompressionConfig';
import { useInternalStorage } from '../hooks/libs/useInternalStorage';
import { useMentionManager } from '../hooks/libs/useMentionManager';
import { ChatGPTUser, chatGPTService } from '../libs/ChatGPT';
import type { GiphyServiceInterface } from '../libs/GiphyService';
import type { ImageCompressionConfigInterface } from '../libs/ImageCompressionConfig';
import type InternalLocalCacheStorage from '../libs/InternalLocalCacheStorage';
import type { MentionConfigInterface } from '../libs/MentionConfig';
import StringSetEn from '../localization/StringSet.en';
import type { StringSet } from '../localization/StringSet.type';
import SBUDynamicModule from '../platform/dynamicModule';
import type {
  ClipboardServiceInterface,
  FileServiceInterface,
  MediaServiceInterface,
  NotificationServiceInterface,
} from '../platform/types';
import type { ErrorBoundaryProps, LocalCacheStorage } from '../types';
import VERSION from '../version';
import InternalErrorBoundaryContainer from './InternalErrorBoundaryContainer';

const NetInfo = SBUDynamicModule.get('@react-native-community/netinfo', 'warn');

export const SendbirdUIKit = Object.freeze({
  VERSION,
  PLATFORM: Platform.OS.toLowerCase(),
  DEFAULT: {
    AUTO_PUSH_TOKEN_REGISTRATION: true,
    CHANNEL_LIST_TYPING_INDICATOR: false,
    CHANNEL_LIST_MESSAGE_RECEIPT_STATUS: false,
    USE_USER_ID_FOR_NICKNAME: false,
    USER_MENTION: false,
    IMAGE_COMPRESSION: true,
    GIPHY: false,
    CHAT_GPT_REPLY: false,
    CHAT_GPT_CONVERSATION: false,
  },
});

export type SendbirdUIKitContainerProps = React.PropsWithChildren<{
  appId: string;
  openaiAPIKey: string;
  platformServices: {
    file: FileServiceInterface;
    notification: NotificationServiceInterface;
    clipboard: ClipboardServiceInterface;
    media: MediaServiceInterface;
  };
  chatOptions?: {
    localCacheStorage?: LocalCacheStorage;
    onInitialized?: (sdkInstance: SendbirdChatSDK) => SendbirdChatSDK;
  } & Partial<UIKitFeaturesInSendbirdChatContext>;
  localization?: {
    stringSet?: StringSet;
  };
  styles?: {
    theme?: UIKitTheme;
    statusBarTranslucent?: boolean;
    defaultHeaderTitleAlign?: 'left' | 'center';
    defaultHeaderHeight?: number;
    HeaderComponent?: HeaderStyleContextType['HeaderComponent'];
  };
  errorBoundary?: {
    disabled?: boolean;
    onError?: (props: ErrorBoundaryProps) => void;
    ErrorInfoComponent?: (props: ErrorBoundaryProps) => JSX.Element;
  };
  toast?: {
    dismissTimeout?: number;
  };
  userProfile?: {
    onCreateChannel: (channel: SendbirdGroupChannel) => void;
    onBeforeCreateChannel?: (
      channelParams: SendbirdGroupChannelCreateParams,
      users: SendbirdUser[] | SendbirdMember[],
    ) => SendbirdGroupChannelCreateParams | Promise<SendbirdGroupChannelCreateParams>;
  };
  userMention?: Pick<Partial<MentionConfigInterface>, 'mentionLimit' | 'suggestionLimit' | 'debounceMills'>;
  imageCompression?: Partial<ImageCompressionConfigInterface>;
  giphyService: GiphyServiceInterface;
}>;

const SendbirdUIKitContainer = ({
  children,
  appId,
  openaiAPIKey,
  chatOptions,
  platformServices,
  localization,
  styles,
  errorBoundary,
  toast,
  userProfile,
  userMention,
  imageCompression,
  giphyService,
}: SendbirdUIKitContainerProps) => {
  const theme = styles?.theme ?? LightUIKitTheme;
  const defaultStringSet = localization?.stringSet ?? StringSetEn;

  const isFirstMount = useIsFirstMount();
  const unsubscribes = useRef<Array<() => void>>([]);

  const imageCompressionConfig = useImageCompressionConfig(imageCompression);
  const internalStorage = useInternalStorage(chatOptions?.localCacheStorage);
  const emojiManager = useEmojiManager(internalStorage);
  const mentionManager = useMentionManager(
    chatOptions?.enableUserMention ?? SendbirdUIKit.DEFAULT.USER_MENTION,
    userMention,
  );

  const [sdkInstance, setSdkInstance] = useState<SendbirdChatSDK>(() => {
    const sendbird = initializeSendbird(appId, internalStorage, chatOptions?.onInitialized);
    unsubscribes.current = sendbird.unsubscribes;
    return sendbird.chatSDK;
  });

  const chatGPT = useMemo(() => chatGPTService(openaiAPIKey), [openaiAPIKey]);
  const chatGPTUser = useMemo(() => {
    const gptUserSDK = Sendbird.init({
      appId,
      modules: [new GroupChannelModule(), new OpenChannelModule()],
      localCacheEnabled: Boolean(internalStorage), // Remove this
      useAsyncStorageStore: internalStorage as never, // Remove this
      newInstance: true,
    });
    return new ChatGPTUser(gptUserSDK, chatGPT);
  }, [chatGPT]);

  useEffect(() => {
    if (giphyService) {
      giphyService.updateDialogConfig({ theme: theme.colorScheme });
    }
  }, [giphyService, theme.colorScheme]);

  useLayoutEffect(() => {
    if (!isFirstMount) {
      const sendbird = initializeSendbird(appId, internalStorage, chatOptions?.onInitialized);
      setSdkInstance(sendbird.chatSDK);
      unsubscribes.current = sendbird.unsubscribes;
    }

    return () => {
      if (!isFirstMount) {
        unsubscribes.current.forEach((u) => {
          try {
            u();
          } catch {}
        });
      }
    };
  }, [appId, internalStorage]);

  const renderChildren = () => {
    if (errorBoundary?.disabled) {
      return children;
    } else {
      return <InternalErrorBoundaryContainer {...errorBoundary}>{children}</InternalErrorBoundaryContainer>;
    }
  };

  return (
    <SafeAreaProvider>
      <SendbirdChatProvider
        sdkInstance={sdkInstance}
        emojiManager={emojiManager}
        mentionManager={mentionManager}
        imageCompressionConfig={imageCompressionConfig}
        giphyService={giphyService}
        chatGPT={chatGPT}
        chatGPTUser={chatGPTUser}
        enableAutoPushTokenRegistration={
          chatOptions?.enableAutoPushTokenRegistration ?? SendbirdUIKit.DEFAULT.AUTO_PUSH_TOKEN_REGISTRATION
        }
        enableChannelListTypingIndicator={
          chatOptions?.enableChannelListTypingIndicator ?? SendbirdUIKit.DEFAULT.CHANNEL_LIST_TYPING_INDICATOR
        }
        enableChannelListMessageReceiptStatus={
          chatOptions?.enableChannelListMessageReceiptStatus ??
          SendbirdUIKit.DEFAULT.CHANNEL_LIST_MESSAGE_RECEIPT_STATUS
        }
        enableUseUserIdForNickname={
          chatOptions?.enableUseUserIdForNickname ?? SendbirdUIKit.DEFAULT.USE_USER_ID_FOR_NICKNAME
        }
        enableUserMention={chatOptions?.enableUserMention ?? SendbirdUIKit.DEFAULT.USER_MENTION}
        enableImageCompression={chatOptions?.enableImageCompression ?? SendbirdUIKit.DEFAULT.IMAGE_COMPRESSION}
        enableGiphy={chatOptions?.enableGiphy ?? SendbirdUIKit.DEFAULT.GIPHY}
        enableChatGPTReply={chatOptions?.enableChatGPTReply ?? SendbirdUIKit.DEFAULT.CHAT_GPT_REPLY}
        enableChatGPTConversation={
          chatOptions?.enableChatGPTConversation ?? SendbirdUIKit.DEFAULT.CHAT_GPT_CONVERSATION
        }
      >
        <LocalizationProvider stringSet={defaultStringSet}>
          <PlatformServiceProvider
            fileService={platformServices.file}
            notificationService={platformServices.notification}
            clipboardService={platformServices.clipboard}
            mediaService={platformServices.media}
          >
            <UIKitThemeProvider theme={theme}>
              <HeaderStyleProvider
                HeaderComponent={styles?.HeaderComponent ?? Header}
                defaultTitleAlign={styles?.defaultHeaderTitleAlign ?? 'left'}
                statusBarTranslucent={styles?.statusBarTranslucent ?? true}
              >
                <ToastProvider dismissTimeout={toast?.dismissTimeout}>
                  <UserProfileProvider
                    onCreateChannel={userProfile?.onCreateChannel}
                    onBeforeCreateChannel={userProfile?.onBeforeCreateChannel}
                    statusBarTranslucent={styles?.statusBarTranslucent ?? true}
                  >
                    <ReactionProvider>
                      <LocalizationContext.Consumer>
                        {(value) => {
                          const STRINGS = value?.STRINGS || defaultStringSet;
                          return (
                            <DialogProvider
                              defaultLabels={{
                                alert: { ok: STRINGS.DIALOG.ALERT_DEFAULT_OK },
                                prompt: {
                                  ok: STRINGS.DIALOG.PROMPT_DEFAULT_OK,
                                  cancel: STRINGS.DIALOG.PROMPT_DEFAULT_CANCEL,
                                  placeholder: STRINGS.DIALOG.PROMPT_DEFAULT_PLACEHOLDER,
                                },
                              }}
                            >
                              {renderChildren()}
                            </DialogProvider>
                          );
                        }}
                      </LocalizationContext.Consumer>
                    </ReactionProvider>
                  </UserProfileProvider>
                </ToastProvider>
              </HeaderStyleProvider>
            </UIKitThemeProvider>
          </PlatformServiceProvider>
        </LocalizationProvider>
      </SendbirdChatProvider>
    </SafeAreaProvider>
  );
};

const initializeSendbird = (
  appId: string,
  internalStorage?: InternalLocalCacheStorage,
  onInitialized?: (sdk: SendbirdChatSDK) => SendbirdChatSDK,
) => {
  const unsubscribes: Array<() => void> = [];
  let chatSDK: SendbirdChatSDK;

  chatSDK = Sendbird.init({
    appId,
    modules: [new GroupChannelModule(), new OpenChannelModule()],
    localCacheEnabled: Boolean(internalStorage),
    useAsyncStorageStore: internalStorage as never,
    newInstance: true,
  });

  if (onInitialized) {
    chatSDK = onInitialized(chatSDK);
  }

  if (SendbirdUIKit.VERSION) {
    chatSDK.addExtension('sb_uikit', SendbirdUIKit.VERSION);
  }

  if (SendbirdUIKit.PLATFORM) {
    chatSDK.addExtension('device-os-platform', SendbirdUIKit.PLATFORM);
  }

  if (NetInfo?.addEventListener) {
    try {
      // NOTE: For removing buggy behavior of NetInfo.addEventListener
      //  When you first add an event listener, it is assumed that the initialization of the internal event detector is done simultaneously.
      //  In other words, when you call the first event listener two events are triggered immediately
      //   - the one that is called when adding the event listener
      //   - and the internal initialization event
      NetInfo.addEventListener(NOOP)();
    } catch {}

    const listener = (callback: () => void, callbackType: 'online' | 'offline') => {
      let callCount = 0;
      const unsubscribe = NetInfo.addEventListener((state) => {
        const online = Boolean(state.isConnected) || Boolean(state.isInternetReachable);

        // NOTE: When NetInfo.addEventListener is called
        //  the event is immediately triggered regardless of whether the event actually occurred.
        //  This is why it filters the first event.
        if (callCount === 0) {
          callCount++;
          return;
        }

        if (online && callbackType === 'online') callback();
        if (!online && callbackType === 'offline') callback();
      });
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    };
    chatSDK.setOnlineListener?.((onOnline) => listener(onOnline, 'online'));
    chatSDK.setOfflineListener?.((onOffline) => listener(onOffline, 'offline'));
  }
  return { chatSDK, unsubscribes };
};

export default SendbirdUIKitContainer;
