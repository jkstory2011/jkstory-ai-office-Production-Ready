import { logout } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return logout(request);
  }
};
