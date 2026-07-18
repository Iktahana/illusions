{
  "targets": [
    {
      "target_name": "as_web_authentication",
      "sources": ["src/as_web_authentication.mm"],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_LDFLAGS": [
          "-framework AuthenticationServices",
          "-framework AppKit",
          "-framework Foundation"
        ]
      }
    }
  ]
}
