import { login } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return login(request);
  }
};
