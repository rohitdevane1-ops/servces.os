# ServiceOS Android ProGuard / R8 Rules
-keepattributes Signature,InnerClasses,EnclosingMethod
-keep class com.serviceos.app.data.model.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
