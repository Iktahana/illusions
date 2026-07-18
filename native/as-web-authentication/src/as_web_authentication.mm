#include <node_api.h>
#include <atomic>
#include <memory>
#include <string>

#import <AppKit/AppKit.h>
#import <AuthenticationServices/AuthenticationServices.h>

@interface AuthenticationRequest : NSObject <ASWebAuthenticationPresentationContextProviding>
@property(nonatomic, strong) ASWebAuthenticationSession *session;
@property(nonatomic, strong) NSString *requestId;
@property(nonatomic, assign) napi_threadsafe_function threadSafeFunction;
@end

@implementation AuthenticationRequest

- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession *)session {
  return NSApp.keyWindow ?: NSApp.mainWindow;
}

@end

static NSMutableDictionary<NSString *, AuthenticationRequest *> *activeRequests;
static std::atomic_bool isShuttingDown = false;

struct SessionContext {
  napi_env env;
  napi_deferred deferred;
};

struct AuthenticationResult {
  bool succeeded;
  std::string callbackUrl;
  std::string message;
  std::string code;
};

static void reject(napi_env env, napi_deferred deferred, NSString *message, NSString *code) {
  napi_value messageValue;
  napi_create_string_utf8(env, message.UTF8String, NAPI_AUTO_LENGTH, &messageValue);
  napi_value error;
  napi_create_error(env, nullptr, messageValue, &error);
  if (code != nil) {
    napi_value codeValue;
    napi_create_string_utf8(env, code.UTF8String, NAPI_AUTO_LENGTH, &codeValue);
    napi_set_named_property(env, error, "code", codeValue);
  }
  napi_reject_deferred(env, deferred, error);
}

// AuthenticationServices invokes its completion handler on an XPC queue, not
// Electron's JavaScript thread. All N-API value creation and promise settlement
// must therefore happen in this threadsafe-function callback.
static void completeOnJavaScriptThread(napi_env env, napi_value, void *context, void *data) {
  std::unique_ptr<SessionContext> sessionContext(static_cast<SessionContext *>(context));
  std::unique_ptr<AuthenticationResult> result(static_cast<AuthenticationResult *>(data));
  if (env == nullptr || isShuttingDown.load()) return;

  if (result->succeeded) {
    napi_value callbackUrl;
    napi_create_string_utf8(env, result->callbackUrl.c_str(), NAPI_AUTO_LENGTH, &callbackUrl);
    napi_resolve_deferred(env, sessionContext->deferred, callbackUrl);
    return;
  }

  NSString *message = [NSString stringWithUTF8String:result->message.c_str()];
  NSString *code = [NSString stringWithUTF8String:result->code.c_str()];
  reject(env, sessionContext->deferred, message, code);
}

static napi_value start(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 3) {
    napi_throw_type_error(env, nullptr,
                          "start requires an authorization URL, callback scheme, and request ID");
    return nullptr;
  }

  size_t urlLength;
  size_t schemeLength;
  size_t requestIdLength;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &urlLength);
  napi_get_value_string_utf8(env, args[1], nullptr, 0, &schemeLength);
  napi_get_value_string_utf8(env, args[2], nullptr, 0, &requestIdLength);
  std::string urlString(urlLength, '\0');
  std::string schemeString(schemeLength, '\0');
  std::string requestIdString(requestIdLength, '\0');
  napi_get_value_string_utf8(env, args[0], urlString.data(), urlString.size() + 1, &urlLength);
  napi_get_value_string_utf8(env, args[1], schemeString.data(), schemeString.size() + 1, &schemeLength);
  napi_get_value_string_utf8(env, args[2], requestIdString.data(), requestIdString.size() + 1,
                             &requestIdLength);

  napi_deferred deferred;
  napi_value promise;
  napi_create_promise(env, &deferred, &promise);

  auto *sessionContext = new SessionContext{env, deferred};
  napi_value resourceName;
  napi_create_string_utf8(env, "ASWebAuthenticationSession", NAPI_AUTO_LENGTH, &resourceName);
  napi_threadsafe_function threadSafeFunction;
  napi_create_threadsafe_function(env, nullptr, nullptr, resourceName, 0, 1, nullptr, nullptr,
                                  sessionContext, completeOnJavaScriptThread, &threadSafeFunction);

  NSString *urlText = [[NSString alloc] initWithBytes:urlString.data()
                                                length:urlString.length()
                                              encoding:NSUTF8StringEncoding];
  NSString *scheme = [[NSString alloc] initWithBytes:schemeString.data()
                                               length:schemeString.length()
                                             encoding:NSUTF8StringEncoding];
  NSString *requestId = [[NSString alloc] initWithBytes:requestIdString.data()
                                                  length:requestIdString.length()
                                                encoding:NSUTF8StringEncoding];
  NSURL *url = [NSURL URLWithString:urlText];
  if (url == nil || scheme.length == 0 || requestId.length == 0) {
    napi_release_threadsafe_function(threadSafeFunction, napi_tsfn_abort);
    delete sessionContext;
    reject(env, deferred, @"Invalid authorization URL, callback scheme, or request ID",
           @"ERR_AUTH_INVALID_ARGUMENT");
    return promise;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if (isShuttingDown) {
      napi_release_threadsafe_function(threadSafeFunction, napi_tsfn_abort);
      delete sessionContext;
      reject(env, deferred, @"Application is shutting down", @"ERR_AUTH_SHUTTING_DOWN");
      return;
    }
    if (activeRequests == nil) activeRequests = [NSMutableDictionary dictionary];

    AuthenticationRequest *request = [AuthenticationRequest new];
    request.requestId = requestId;
    request.threadSafeFunction = threadSafeFunction;
    napi_threadsafe_function requestThreadSafeFunction = threadSafeFunction;
    request.session = [[ASWebAuthenticationSession alloc]
        initWithURL:url
        callbackURLScheme:scheme
        completionHandler:^(NSURL *callbackURL, NSError *error) {
          auto *result = new AuthenticationResult();
          if (callbackURL != nil) {
            result->succeeded = true;
            result->callbackUrl = callbackURL.absoluteString.UTF8String;
          } else {
            result->succeeded = false;
            result->message = (error.localizedDescription ?: @"Authentication session failed").UTF8String;
            result->code = error.code == ASWebAuthenticationSessionErrorCodeCanceledLogin
                               ? "ERR_AUTH_CANCELLED"
                               : "ERR_AUTH_SESSION";
          }
          if (!isShuttingDown.load()) {
            napi_call_threadsafe_function(requestThreadSafeFunction, result, napi_tsfn_nonblocking);
            napi_release_threadsafe_function(requestThreadSafeFunction, napi_tsfn_release);
          } else {
            // The process is exiting. Do not call into a tearing-down V8/N-API
            // runtime; process teardown will reclaim the pending session data.
            delete result;
          }
          // AuthenticationServices calls this block from an XPC queue. Keep
          // AppKit/Foundation session bookkeeping on the main queue as well.
          dispatch_async(dispatch_get_main_queue(), ^{
            [activeRequests removeObjectForKey:requestId];
          });
        }];
    request.session.presentationContextProvider = request;
    activeRequests[requestId] = request;

    if (![request.session start]) {
      [activeRequests removeObjectForKey:requestId];
      napi_release_threadsafe_function(threadSafeFunction, napi_tsfn_abort);
      delete sessionContext;
      reject(env, deferred, @"Unable to start the authentication session", @"ERR_AUTH_SESSION");
    }
  });

  return promise;
}

static napi_value cancel(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 1) {
    napi_throw_type_error(env, nullptr, "cancel requires a request ID");
    return nullptr;
  }
  size_t requestIdLength;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &requestIdLength);
  std::string requestIdString(requestIdLength, '\0');
  napi_get_value_string_utf8(env, args[0], requestIdString.data(), requestIdString.size() + 1,
                             &requestIdLength);
  NSString *requestId = [[NSString alloc] initWithBytes:requestIdString.data()
                                                  length:requestIdString.length()
                                                encoding:NSUTF8StringEncoding];
  dispatch_async(dispatch_get_main_queue(), ^{
    [activeRequests[requestId].session cancel];
  });
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

static napi_value cancelAllForShutdown(napi_env env, napi_callback_info info) {
  isShuttingDown = true;
  dispatch_async(dispatch_get_main_queue(), ^{
    for (AuthenticationRequest *request in activeRequests.allValues) [request.session cancel];
    [activeRequests removeAllObjects];
  });
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

NAPI_MODULE_INIT() {
  napi_value startFunction;
  napi_create_function(env, "start", NAPI_AUTO_LENGTH, start, nullptr, &startFunction);
  napi_set_named_property(env, exports, "start", startFunction);
  napi_value cancelFunction;
  napi_create_function(env, "cancel", NAPI_AUTO_LENGTH, cancel, nullptr, &cancelFunction);
  napi_set_named_property(env, exports, "cancel", cancelFunction);
  napi_value cancelAllFunction;
  napi_create_function(env, "cancelAllForShutdown", NAPI_AUTO_LENGTH, cancelAllForShutdown, nullptr,
                       &cancelAllFunction);
  napi_set_named_property(env, exports, "cancelAllForShutdown", cancelAllFunction);
  return exports;
}
