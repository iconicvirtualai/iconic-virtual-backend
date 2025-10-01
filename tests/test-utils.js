export function createMockReq({ method = "GET", body = {}, headers = {}, query = {} } = {}) {
  return {
    method,
    body,
    headers,
    query,
  };
}

export function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      if (payload !== undefined) {
        this.body = payload;
      }
      this.ended = true;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}
