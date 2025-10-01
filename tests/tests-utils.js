+export function createMockReq({ method = "GET", body = {}, headers = {} } = {}) {
+  return {
+    method,
+    body,
+    headers,
+  };
+}
+
+export function createMockRes() {
+  return {
+    statusCode: 200,
+    headers: {},
+    body: undefined,
+    ended: false,
+    status(code) {
+      this.statusCode = code;
+      return this;
+    },
+    json(payload) {
+      this.body = payload;
+      return this;
+    },
+    end(payload) {
+      if (payload !== undefined) {
+        this.body = payload;
+      }
+      this.ended = true;
+      return this;
+    },
+    setHeader(name, value) {
+      this.headers[name] = value;
+    },
+  };
+}
